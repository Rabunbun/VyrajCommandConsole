import { exportEft } from "@/lib/fitting/eft/export";
import { EftExportHydrationError } from "@/lib/fitting/eft/export-project";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const value = await request.json().catch(() => null);

  try {
    return Response.json(await exportEft(value), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EftExportHydrationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.warn("EFT export is temporarily unavailable.");
    return Response.json(
      { error: "EFT export is temporarily unavailable." },
      { status: 503 },
    );
  }
}
