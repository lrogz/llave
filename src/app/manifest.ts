import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/hoy",
    name: "Black Key · Administración de propiedades",
    short_name: "Black Key",
    description: "Tus propiedades, rentas, tickets y proveedores en un solo lugar.",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14201c",
    theme_color: "#14201c",
    lang: "es-MX",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoy", url: "/hoy", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tickets", url: "/tickets", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pagos", url: "/pagos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
