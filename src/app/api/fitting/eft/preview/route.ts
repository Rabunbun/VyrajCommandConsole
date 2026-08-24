import { previewEft } from "@/lib/fitting/eft/preview";

export const dynamic = "force-dynamic";

const maximumEftLength = 250_000;

export async function POST(request: Request) {
  const input = await parsePreviewRequest(request);

  if (!input.ok) {
    return Response.json({ error: input.message }, { status: 400 });
  }

  try {
    return Response.json(await previewEft(input.eftText), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.warn("EFT preview is temporarily unavailable.");
    return Response.json(
      { error: "EFT preview is temporarily unavailable." },
      { status: 503 },
    );
  }
}

async function parsePreviewRequest(request: Request): Promise<
  | { message: string; ok: false }
  | { eftText: string; ok: true }
> {
  const value = await request.json().catch(() => null);
  if (
    value === null ||
    typeof value !== "object" ||
    !("eftText" in value) ||
    typeof value.eftText !== "string"
  ) {
    return { message: "eftText must be a string.", ok: false };
  }
  if (value.eftText.length > maximumEftLength) {
    return {
      message: `eftText must not exceed ${maximumEftLength} characters.`,
      ok: false,
    };
  }
  return { eftText: value.eftText, ok: true };
}
