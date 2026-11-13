import { Suspense } from "react";
import { connection } from "next/server";
import { mensajeCaseta } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { Refrescar } from "@/components/vecino/Refrescar";
import { CAMPO, Cargando, LinkInvalido, Pantalla, Titulo, Vacio } from "@/components/vecino/Piezas";
import { cuando, datosVecino } from "@/lib/condominios";

const RAPIDOS = ["Va a llegar una visita, por favor déjenla pasar", "¿Llegó algún paquete para mí?", "Va a llegar un repartidor de comida", "Hay un ruido extraño cerca de mi casa"];

export default function Caseta({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  return (
    <Pantalla>
      <Refrescar />
      <Titulo titulo="Caseta" sub={`Chat de ${d.vivienda.numero} con vigilancia`} />
      <section aria-label="Mensajes" aria-live="polite" className="flex flex-col gap-2">
        {d.chat.length ? (
          d.chat.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-lg ${m.lado === "residente" ? "self-end rounded-br-md bg-[#17583A] text-white" : "self-start rounded-bl-md border border-[#E1DCD0] bg-[#FBF9F4]"}`}>
              <p className="whitespace-pre-line">{m.texto}</p>
              <p className={`mt-0.5 text-xs ${m.lado === "residente" ? "text-white/75" : "text-[#5A5547]"}`}>
                {m.lado === "caseta" ? "Caseta · " : ""}
                {cuando(m.created_at)}
              </p>
            </div>
          ))
        ) : (
          <Vacio>Escríbele a caseta: avísales de una visita, una entrega o cualquier cosa. El guardia en turno te responde aquí.</Vacio>
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        {RAPIDOS.map((t) => (
          <form key={t} action={mensajeCaseta}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="texto" value={t} />
            <button type="submit" className="min-h-11 rounded-full border border-[#BDB8AC] bg-[#FBF9F4] px-4 text-left text-base">
              {t}
            </button>
          </form>
        ))}
      </div>
      <form action={mensajeCaseta} className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex gap-2 bg-[#F7F4EE] py-2">
        <input type="hidden" name="token" value={token} />
        <label className="sr-only" htmlFor="texto">
          Mensaje para caseta
        </label>
        <input id="texto" name="texto" required maxLength={1000} autoComplete="off" placeholder="Escribe a caseta…" className={CAMPO} />
        <Boton enviando="…" className="min-h-13! shrink-0 rounded-xl! bg-[#17583A]! px-5! text-lg!">
          Enviar
        </Boton>
      </form>
    </Pantalla>
  );
}
