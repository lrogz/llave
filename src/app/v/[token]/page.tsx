import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PieLegal } from "@/components/PieLegal";
import { caracteristicas, descripcionSugerida, lugar, tituloAnuncio } from "@/lib/anuncio";
import { linkWhatsApp, pesos } from "@/lib/datos";
import { anuncioPorToken, fotosAnuncio } from "./datos";
import { MeInteresa } from "./MeInteresa";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const p = await anuncioPorToken(token);
  if (!p) return { title: "Anuncio no disponible", robots: { index: false } };
  const titulo = `${tituloAnuncio(p)}${p.renta_mensual ? ` · ${pesos.format(Number(p.renta_mensual))}/mes` : ""}`;
  const descripcion = [caracteristicas(p).join(" · "), p.organizaciones?.nombre].filter(Boolean).join(" — ");
  return { title: titulo, description: descripcion, openGraph: { title: titulo, description: descripcion, images: [`/v/${token}/foto`] } };
}

export default function AnuncioPublico({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-6">
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: Props) {
  await connection();
  const { token } = await params;
  const p = await anuncioPorToken(token);
  if (!p) {
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Este anuncio ya no está disponible</h1>
        <p className="mt-2 text-sm text-gris">Probablemente ya se rentó. 🙂</p>
      </div>
    );
  }
  const fotos = await fotosAnuncio(p);
  const chips = caracteristicas(p);
  const org = p.organizaciones?.nombre ?? "";

  return (
    <>
      {fotos.length > 0 ? (
        <section aria-label="Fotos" className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          {fotos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase
            <img key={i} src={u} alt={i === 0 ? tituloAnuncio(p) : `Foto ${i + 1}`} className="aspect-[4/3] w-[85%] flex-none snap-center rounded-2xl object-cover sm:w-[70%]" />
          ))}
        </section>
      ) : (
        <div className="flex aspect-[16/7] items-center justify-center rounded-2xl bg-[#D8E3DE] text-sm text-gris">Pronto más fotos</div>
      )}

      <header className="flex flex-col gap-1">
        <p className="text-sm text-gris">{org}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{tituloAnuncio(p)}</h1>
        {lugar(p) && <p className="text-gris">{lugar(p)}</p>}
        {p.renta_mensual && (
          <p className="mt-1 font-display text-3xl font-bold">
            {pesos.format(Number(p.renta_mensual))} <span className="text-base font-normal text-gris">al mes</span>
          </p>
        )}
      </header>

      {chips.length > 0 && (
        <ul aria-label="Características" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold">
              {c}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Descripción" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Descripción</h2>
        <p className="whitespace-pre-line text-gris">{p.descripcion_anuncio || descripcionSugerida(p)}</p>
        {p.requisitos && (
          <>
            <h2 className="mt-2 font-bold">Requisitos</h2>
            <p className="whitespace-pre-line text-gris">{p.requisitos}</p>
          </>
        )}
      </section>

      <section aria-label="Pedir informes" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 className="font-display text-2xl font-bold">¿Te interesa?</h2>
        {p.anuncio_whatsapp && (
          <a
            href={linkWhatsApp(p.anuncio_whatsapp, `Hola, me interesa ${tituloAnuncio(p)}${p.renta_mensual ? ` de ${pesos.format(Number(p.renta_mensual))}` : ""}. ¿Sigue disponible?`)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-13 items-center justify-center rounded-xl bg-[#25D366] text-base font-bold text-tinta"
          >
            Escribir por WhatsApp
          </a>
        )}
        <p className="text-sm text-gris">{p.anuncio_whatsapp ? "O déjanos tus datos y te contactamos:" : "Déjanos tus datos y te contactamos:"}</p>
        <MeInteresa token={token} />
        <PieLegal />
      </section>
    </>
  );
}
