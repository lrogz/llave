import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NavVecino } from "@/components/vecino/NavVecino";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Mi privada",
    robots: { index: false, follow: false },
    referrer: "same-origin",
    manifest: `/vecino/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Mi privada", statusBarStyle: "default" },
  };
}
export const viewport: Viewport = { themeColor: "#F7F4EE" };

// Portal del residente: fondo crema, barra de secciones abajo.
export default function LayoutVecino({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#F7F4EE] pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-[#1F1E1A]">
      {children}
      <Suspense fallback={null}>
        <NavVecino />
      </Suspense>
    </div>
  );
}
