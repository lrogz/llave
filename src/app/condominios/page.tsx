import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { sesionConOrg } from "@/lib/sesion";
import { dinero } from "@/lib/condominios";
import { cargarEjemplo, crearCondominio } from "./actions";

export const metadata: Metadata = { title: "Condominios · Black Key" };

export default function Condominios({ searchParams }: { searchParams: Promise<{ ejemplo?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ ejemplo?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { ejemplo } = await searchParams;
  const [{ data: conds }, { data: saldos }, { data: pagos }, { data: tickets }, { data: altas }] = await Promise.all([
    supabase.from("condominios").select("id, nombre, direccion").order("nombre"),
    supabase.from("saldos_vivienda").select("condominio_id, saldo_centavos"),
    supabase.from("pagos_condominio").select("condominio_id").eq("estado", "pendiente"),
    supabase.from("tickets").select("condominio_id").not("condominio_id", "is", null).not("estado", "in", "(resuelto,cancelado)"),
    supabase.from("solicitudes_alta").select("condominio_id").eq("estado", "pendiente"),
  ]);
  const cuenta = (lista: { condominio_id: string | null }[] | null, id: string) => (lista ?? []).filter((x) => x.condominio_id === id).length;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Condominios" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-6 px-5 py-8 sm:px-10">
        <header>
          <p className="text-sm font-semibold text-gris">Privadas y condominios</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">Condominios</h1>
          <p className="mt-1 max-w-2xl text-sm text-gris">Caseta con pases QR, chat con vigilancia, paquetería, cuotas con recibos, amenidades y reportes de vecinos que llegan a tus tickets y proveedores de siempre.</p>
        </header>
        {ejemplo && <p className="rounded-xl bg-verde-claro px-4 py-3 text-sm text-verde-oscuro">Listo: cargamos dos condominios de ejemplo con datos ficticios. Los guardias de ejemplo entran con el PIN 1234.</p>}

        {conds?.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {conds.map((c) => {
              const adeudo = (saldos ?? []).filter((s) => s.condominio_id === c.id && Number(s.saldo_centavos) > 0);
              return (
                <li key={c.id}>
                  <Link href={`/condominios/${c.id}`} className="flex h-full flex-col gap-3 rounded-2xl bg-white p-5 hover:ring-2 hover:ring-menta">
                    <span>
                      <span className="block font-display text-xl font-bold">{c.nombre}</span>
                      {c.direccion && <span className="block text-sm text-gris">{c.direccion}</span>}
                    </span>
                    <span className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-fondo px-2.5 py-1">{(saldos ?? []).filter((s) => s.condominio_id === c.id).length} viviendas</span>
                      {adeudo.length > 0 && (
                        <span className="rounded-full bg-naranja-claro px-2.5 py-1 text-naranja-oscuro">
                          {adeudo.length} con adeudo · {dinero(adeudo.reduce((s, x) => s + Number(x.saldo_centavos), 0))}
                        </span>
                      )}
                      {cuenta(pagos, c.id) > 0 && <span className="rounded-full bg-[#E8EEFB] px-2.5 py-1 text-[#2A4A93]">{cuenta(pagos, c.id)} pagos por revisar</span>}
                      {cuenta(tickets, c.id) > 0 && <span className="rounded-full bg-[#FFF4E0] px-2.5 py-1 text-[#7A4E00]">{cuenta(tickets, c.id)} reportes abiertos</span>}
                      {cuenta(altas, c.id) > 0 && <span className="rounded-full bg-verde-claro px-2.5 py-1 text-verde-oscuro">{cuenta(altas, c.id)} altas por revisar</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-borde bg-white/60 p-6 text-sm text-gris">Aún no tienes condominios. Crea uno o carga los ejemplos para hacer una demo.</p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <form action={crearCondominio} className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-display text-xl font-bold">Nuevo condominio</h2>
            <input name="nombre" required maxLength={120} placeholder="Privada Los Encinos" className="min-h-11 rounded-xl border border-borde px-3" aria-label="Nombre" />
            <input name="direccion" maxLength={200} placeholder="Dirección" className="min-h-11 rounded-xl border border-borde px-3" aria-label="Dirección" />
            <input name="colonia" maxLength={120} placeholder="Colonia" className="min-h-11 rounded-xl border border-borde px-3" aria-label="Colonia" />
            <Boton>Crear condominio</Boton>
            <p className="text-xs text-gris">Cuenta como una propiedad de tu plan (sus áreas comunes), donde llegan los reportes de vecinos.</p>
          </form>
          <form action={cargarEjemplo} className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-display text-xl font-bold">Datos de ejemplo</h2>
            <p className="text-sm text-gris">Una privada de 60 casas y un condominio de 2 torres con residentes, cuotas, pagos, guardias (PIN 1234), amenidades y avisos ficticios. Útil para demos con clientes.</p>
            <Boton estilo="claro" enviando="Cargando…">
              Cargar condominios de ejemplo
            </Boton>
          </form>
        </div>
      </main>
    </div>
  );
}
