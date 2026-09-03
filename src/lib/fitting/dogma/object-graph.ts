import type {
  DogmaObjectGraph,
  DogmaRuntimeObject,
  DogmaRuntimeObjectKind,
  DogmaTypeProjection
} from "./types";

export type DogmaGraphModuleInput = Readonly<{
  charge?: Readonly<{ instanceId: string; projection: DogmaTypeProjection }> | null;
  instanceId: string;
  kind: "module" | "rig";
  projection: DogmaTypeProjection;
}>;

export type BuildDogmaObjectGraphInput = Readonly<{
  activeDrones?: readonly Readonly<{
    instanceId: string;
    projection: DogmaTypeProjection;
  }>[];
  cargo?: readonly Readonly<{
    instanceId: string;
    projection: DogmaTypeProjection;
  }>[];
  character: Readonly<{
    instanceId: string;
    projection: DogmaTypeProjection | null;
  }>;
  modules: readonly DogmaGraphModuleInput[];
  ship: Readonly<{ instanceId: string; projection: DogmaTypeProjection }>;
  skills?: readonly Readonly<{
    activeLevel: number;
    instanceId: string;
    projection: DogmaTypeProjection;
  }>[];
}>;

export function buildDogmaObjectGraph(
  input: BuildDogmaObjectGraphInput
): DogmaObjectGraph {
  const objects = new Map<string, DogmaRuntimeObject>();
  addObject(objects, {
    attributeOverrides: [],
    instanceId: input.character.instanceId,
    kind: "character",
    locationInstanceId: null,
    otherInstanceId: null,
    ownerInstanceId: input.character.instanceId,
    projection: input.character.projection
  });
  addObject(objects, {
    attributeOverrides: [],
    instanceId: input.ship.instanceId,
    kind: "ship",
    locationInstanceId: null,
    otherInstanceId: null,
    ownerInstanceId: input.character.instanceId,
    projection: input.ship.projection
  });

  for (const skill of input.skills ?? []) {
    addObject(objects, {
      attributeOverrides: [{ attributeId: 280, value: skill.activeLevel }],
      instanceId: skill.instanceId,
      kind: "skill",
      locationInstanceId: input.character.instanceId,
      otherInstanceId: null,
      ownerInstanceId: input.character.instanceId,
      projection: skill.projection
    });
  }

  for (const fittedItem of input.modules) {
    addObject(objects, {
      attributeOverrides: [],
      instanceId: fittedItem.instanceId,
      kind: fittedItem.kind,
      locationInstanceId: input.ship.instanceId,
      otherInstanceId: fittedItem.charge?.instanceId ?? null,
      ownerInstanceId: input.character.instanceId,
      projection: fittedItem.projection
    });
    if (fittedItem.charge) {
      addObject(objects, {
        attributeOverrides: [],
        instanceId: fittedItem.charge.instanceId,
        kind: "charge",
        locationInstanceId: fittedItem.instanceId,
        otherInstanceId: fittedItem.instanceId,
        ownerInstanceId: input.character.instanceId,
        projection: fittedItem.charge.projection
      });
    }
  }

  for (const cargo of input.cargo ?? []) {
    addObject(objects, childObject(cargo, "cargo", input));
  }
  for (const drone of input.activeDrones ?? []) {
    addObject(objects, childObject(drone, "drone", input));
  }

  return {
    characterInstanceId: input.character.instanceId,
    objects,
    shipInstanceId: input.ship.instanceId
  };
}

function childObject(
  inputObject: Readonly<{ instanceId: string; projection: DogmaTypeProjection }>,
  kind: DogmaRuntimeObjectKind,
  graphInput: BuildDogmaObjectGraphInput
): DogmaRuntimeObject {
  return {
    attributeOverrides: [],
    instanceId: inputObject.instanceId,
    kind,
    locationInstanceId: graphInput.ship.instanceId,
    otherInstanceId: null,
    ownerInstanceId: graphInput.character.instanceId,
    projection: inputObject.projection
  };
}

function addObject(
  objects: Map<string, DogmaRuntimeObject>,
  object: DogmaRuntimeObject
) {
  if (objects.has(object.instanceId)) {
    throw new Error(`Duplicate Dogma runtime instance ${object.instanceId}.`);
  }
  objects.set(object.instanceId, object);
}
