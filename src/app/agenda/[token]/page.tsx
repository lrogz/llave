import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { fechaCita, horarioValido, horariosLibres } from "@/lib/agenda";
import { createAdminClient } from "@/lib/supabase/admin";
import { ElegirHorario } from "./ElegirHorario";

export const metadata: Metadata = { title: "Visita · Black Key", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

export default function Agenda(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido {...props} />
      </Suspense>
    </main>
  );
}

type Cita = {
  id: string;
  inicio: string | null;
  fin: string | null;
  estado: string;
  proveedor_id: string;
  llegada_at: string | null;
  salida_at: string | null;
  organizaciones: { nombre: string } | null;
  proveedores: { nombre: string; horario: unknown; verificado: boolean | null } | null;
  propiedades: { nombre: string; direccion: string | null; colonia: string | null } | null;
  tickets: { titulo: string } | null;
};

const horaCorta = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });
const diaLargo = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });

async function Contenido({ params }: Props) {
  await connection();
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = /^[0-9a-f]{32}$/.test(token)
    ? await admin
        .from("citas")
        .select("id, inicio, fin, estado, proveedor_id, llegada_at, salida_at, organizaciones(nombre), proveedores(nombre, horario, verificado), propiedades(nombre, direccion, colonia), tickets(titulo)")
        .eq("token", token)
        .maybeSingle()
    : { data: null };
  const c = data as unknown as Cita | null;
  if (!c) return <p className="rounded-2xl bg-white p-6">Este link no es válido. Pídelo de nuevo a tu administradora.</p>;
  const casa = [c.propiedades?.nombre, c.propiedades?.direccion, c.propiedades?.colonia].filter(Boolean).join(", ");
  const quien = `${c.proveedores?.nombre ?? "El proveedor"}${c.proveedores?.verificado ? " ✓" : ""}`;

  const encabezado = (
    <header>
      <p className="text-sm text-gris">{c.organizaciones?.nombre}</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">Visita para {c.tickets?.titulo ?? "tu reporte"}</h1>
      <p className="mt-1 text-gris">
        {quien} · {casa}
      </p>
    </header>
  );

  if (c.estado === "cancelada") return <>{encabezado}<p className="rounded-2xl bg-white p-5">Esta visita se canceló. Si necesitas algo, escríbele a tu administradora.</p></>;

  if (c.estado === "por_elegir") {
    const horario = c.proveedores?.horario;
    const libres = horarioValido(horario) ? await horariosLibres(admin, c.proveedor_id, horario, 10) : [];
    const espacios = libres.slice(0, 80).map((e) => ({ valor: `${e.inicio}|${e.fin}`, dia: diaLargo.format(new Date(e.inicio)), hora: horaCorta.format(new Date(e.inicio)) }));
    return (
      <>
        {encabezado}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-bold">¿Cuándo puedes recibirlo?</h2>
          <p className="text-sm text-gris">Elige el horario que te quede mejor. Se le avisa al proveedor y a tu administradora.</p>
          {espacios.length ? <ElegirHorario token={token} espacios={espacios} /> : <p className="text-sm">No hay horarios libres en los próximos días. Escríbele a tu administradora para acordar otra fecha.</p>}
        </section>
      </>
    );
  }

  return (
    <>
      {encabezado}
      <section className="flex flex-col gap-3 rounded-2xl bg-verde-claro p-5 text-verde-oscuro">
        <span className="text-sm font-semibold">{c.estado === "hecha" || c.salida_at ? "✓ Visita terminada" : c.llegada_at ? "El proveedor ya llegó" : "✓ Visita confirmada"}</span>
        <span className="font-display text-2xl font-bold first-letter:uppercase">{c.inicio ? fechaCita(c.inicio) : ""}</span>
        {c.estado === "confirmada" && (
          <a href={`/agenda/${token}/ics`} className="flex min-h-11 items-center self-start rounded-xl bg-white px-4 text-sm font-bold text-tinta">
            Guardar en mi calendario
          </a>
        )}
      </section>
      {c.estado === "confirmada" && <p className="text-sm text-gris">Te mandaremos un recordatorio un día antes. Si ya no puedes recibirlo, avísale a tu administradora.</p>}
    </>
  );
}
