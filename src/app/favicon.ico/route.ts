const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#080607"/>
  <path d="M32 6 56 32 32 58 8 32Z" fill="none" stroke="#b91c1c" stroke-width="5"/>
  <path d="M32 17 45 32 32 47 19 32Z" fill="#3f0a0d" stroke="#f59e0b" stroke-width="3"/>
  <path d="M32 23 39 32 32 41 25 32Z" fill="#ef4444"/>
</svg>`;

export const dynamic = "force-static";

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml"
    }
  });
}
