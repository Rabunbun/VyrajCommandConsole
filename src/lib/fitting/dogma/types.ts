export const DOGMA_PROJECTION_VERSION = 1;

export type DogmaEffectCapability =
  | "generic-modifier"
  | "metadata-nonexecuting"
  | "requires-special-handler"
  | "unsupported-unknown";

export type DogmaAttributeDefinition = Readonly<{
  attributeId: number;
  defaultValue: number | null;
  highIsGood: boolean | null;
  maxAttributeId: number | null;
  minAttributeId: number | null;
  name: string;
  stackable: boolean;
  unitId: number | null;
}>;

export type DogmaModifierDefinition = Readonly<{
  domain: string | null;
  effectId: number;
  functionName: string;
  groupId: number | null;
  modifiedAttributeId: number | null;
  modifyingAttributeId: number | null;
  operation: number | null;
  ordinal: number;
  skillTypeId: number | null;
}>;

export type DogmaEffectDefinition = Readonly<{
  capability: DogmaEffectCapability;
  categoryId: number;
  dischargeAttributeId: number | null;
  durationAttributeId: number | null;
  effectId: number;
  modifiers: readonly DogmaModifierDefinition[];
  name: string;
}>;

export type DogmaTypeAttributeValue = Readonly<{
  attributeId: number;
  value: number;
}>;

export type DogmaTypeEffectReference = Readonly<{
  effectId: number;
  isDefault: boolean;
}>;

export type DogmaTypeProjection = Readonly<{
  attributes: readonly DogmaTypeAttributeValue[];
  categoryId: number;
  effects: readonly DogmaTypeEffectReference[];
  groupId: number;
  requiredSkillTypeIds: readonly number[];
  typeId: number;
}>;

export type DogmaRuntimeObjectKind =
  | "character"
  | "skill"
  | "ship"
  | "module"
  | "rig"
  | "charge"
  | "cargo"
  | "drone"
  | "structure";

export type DogmaRuntimeObject = Readonly<{
  attributeOverrides: readonly DogmaTypeAttributeValue[];
  instanceId: string;
  kind: DogmaRuntimeObjectKind;
  locationInstanceId: string | null;
  otherInstanceId: string | null;
  ownerInstanceId: string | null;
  projection: DogmaTypeProjection | null;
}>;

export type DogmaObjectGraph = Readonly<{
  characterInstanceId: string;
  objects: ReadonlyMap<string, DogmaRuntimeObject>;
  shipInstanceId: string;
}>;

export type EngineDiagnosticSeverity = "info" | "warning" | "unsupported" | "error";

export type EngineDiagnostic = Readonly<{
  attributeId?: number;
  code: string;
  effectId?: number;
  instanceId?: string;
  message: string;
  relatedAttributeIds?: readonly number[];
  severity: EngineDiagnosticSeverity;
}>;

export type ModifierTarget = Readonly<{
  attributeId: number;
  instanceId: string;
}>;

export type ModifierSource = Readonly<{
  attributeId: number;
  effectId: number;
  instanceId: string;
  typeId: number | null;
}>;

export type CollectedModifier = Readonly<{
  definition: DogmaModifierDefinition;
  source: ModifierSource;
  target: ModifierTarget;
}>;

export type ModifierTrace = Readonly<{
  after: number;
  before: number;
  effectId: number;
  effectiveContribution: number;
  effectiveMultiplier: number | null;
  effectiveValue: number;
  modifyingAttributeId: number;
  operation: number;
  ordinal: number;
  rawValue: number;
  rawMultiplier: number | null;
  sourceInstanceId: string;
  sourceTypeId: number | null;
  stackingFactor: number | null;
  stackingPosition: number | null;
}>;

export type AttributeResult = Readonly<{
  attributeId: number;
  base: number | null;
  diagnostics: readonly EngineDiagnostic[];
  effective: number | null;
  explicit: boolean;
  maxAttributeId: number | null;
  minAttributeId: number | null;
  modifiers: readonly ModifierTrace[];
}>;

export type AttributeDependency = Readonly<{
  sourceAttributeId: number;
  sourceInstanceId: string;
  targetAttributeId: number;
  targetInstanceId: string;
}>;
