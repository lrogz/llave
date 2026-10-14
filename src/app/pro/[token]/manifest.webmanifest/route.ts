// Manifest propio del portal: al instalarlo, la app abre directo en la agenda de ese proveedor.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return new Response("No encontrado", { status: 404 });
  const inicio = `/pro/${token}`;
  return Response.json(
    {
      id: inicio,
      name: "Mi agenda · Black Key",
      short_name: "Mi agenda",
      description: "Tus trabajos y visitas de Black Key.",
      start_url: inicio,
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#14201c",
      theme_color: "#14201c",
      lang: "es-MX",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
