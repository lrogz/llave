import { NextResponse, type NextRequest } from "next/server";
import { anuncioPorToken, fotosAnuncio } from "../datos";

// Imagen para la vista previa al compartir (WhatsApp/Facebook): redirige a la foto principal vigente.
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await anuncioPorToken(token);
  const url = p ? (await fotosAnuncio(p))[0] : null;
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, 302);
}
