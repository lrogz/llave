import { esToken } from "@/lib/condominios";

// Para que "Agregar a inicio" abra el portal de ESTE residente y no el panel de la administradora.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!esToken(token)) return new Response("No encontrado", { status: 404 });
  return Response.json(
    {
      id: `/vecino/${token}`,
      name: "Mi privada",
      short_name: "Mi privada",
      start_url: `/vecino/${token}`,
      scope: `/vecino/${token}`,
      display: "standalone",
      background_color: "#F7F4EE",
      theme_color: "#F7F4EE",
      lang: "es-MX",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } },
  );
}
