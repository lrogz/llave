import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700"] });
const sans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const mono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: "Black Key · Administración de propiedades",
  description: "Tus propiedades, tickets y proveedores en un solo lugar. Sin Excel ni WhatsApps sueltos.",
  applicationName: "Black Key",
  appleWebApp: { capable: true, title: "Black Key", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#14201c", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
