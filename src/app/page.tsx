import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Cargando, Menu } from "@/components/Menu";
import { Boton } from "@/components/Boton";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { pesos } from "@/lib/datos";
import { agregarPropiedad, crearOrganizacion } from "./actions";

type Propiedad = {
  id: string;
  nombre: string;
  direccion: string | null;
  tipo: string;
  estado: "rentada" | "vacia" | "en_mantenimiento";
  renta_mensual: number | null;
  tickets: { estado: string }[];
};

const ESTADOS: Record<Propiedad["estado"], { texto: string; clase: string }> = {
  rentada: { texto: "Rentada", clase: "bg-verde-claro text-verde-oscuro" },
  vacia: { texto: "Vacía", clase: "bg-fondo text-gris" },
  en_mantenimiento: { texto: "En mantenimiento", clase: "bg-naranja-claro text-naranja-oscuro" },
};

const TIPOS = [
  ["casa", "Casa"],
  ["departamento", "Departamento"],
  ["local", "Local"],
  ["oficina", "Oficina"],
  ["unidad_condominio", "Unidad en condominio"],
  ["otro", "Otro"],
] as const;

export default function Inicio() {
  if (!supabaseConfigurado) return <Configurar />;
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  await connection(); // depende de la sesión: siempre por request
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membresias } = await supabase
    .from("miembros")
    .select("organizacion_id, organizaciones(nombre)")
    .limit(1);

  const membresia = membresias?.[0];
  if (!membresia) return <CrearOrganizacion email={user?.email ?? ""} />;

  const org = membresia.organizaciones as unknown as { nombre: string } | null;

  const { data } = await supabase
    .from("propiedades")
    .select("id, nombre, direccion, tipo, estado, renta_mensual, tickets(estado)")
    .order("created_at", { ascending: false });

  const propiedades = (data ?? []) as Propiedad[];
  const abiertos = (p: Propiedad) =>
    p.tickets.filter((t) => t.estado !== "resuelto" && t.estado !== "cancelado").length;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Propiedades" nombreOrg={org?.nombre ?? ""} />

      <main className="min-w-0 flex-[999_1_560px] px-5 py-8 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">
              {propiedades.length} {propiedades.length === 1 ? "propiedad" : "propiedades"}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">Mis propiedades</h1>
          </div>
          <Link
            href="/propiedades/importar"
            className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold hover:border-verde"
          >
            Importar desde Excel
          </Link>
        </header>

        {propiedades.length === 0 && (
          <Link
            href="/propiedades/importar"
            className="mt-6 flex flex-col gap-1 rounded-2xl bg-tinta p-5 text-white hover:opacity-95"
          >
            <span className="font-display text-xl font-bold">¿Tienes tu cartera en Excel?</span>
            <span className="text-sm text-white/70">Súbela y la importamos completa en un minuto →</span>
          </Link>
        )}

        <section aria-label="Propiedades" className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {propiedades.map((p) => {
            const n = abiertos(p);
            const estado = ESTADOS[p.estado];
            return (
              <Link key={p.id} href={`/propiedades/${p.id}`} className="flex flex-col overflow-hidden rounded-2xl bg-white hover:ring-2 hover:ring-verde/30">
                <div className="flex h-24 items-end justify-between bg-[#D8E3DE] px-3 py-2.5">
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold capitalize">
                    {p.tipo.replace("_", " ")}
                  </span>
                  {n > 0 && (
                    <span className="rounded-full bg-naranja px-2.5 py-1 text-xs font-bold text-white">
                      {n} {n === 1 ? "ticket" : "tickets"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2.5 p-4">
                  <div>
                    <h2 className="font-bold">{p.nombre}</h2>
                    {p.direccion && <p className="text-sm text-gris">{p.direccion}</p>}
                  </div>
                  <div className="flex items-center justify-between border-t border-borde-suave pt-2.5 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${estado.clase}`}>{estado.texto}</span>
                    {p.renta_mensual != null && <span className="font-mono">{pesos.format(p.renta_mensual)}</span>}
                  </div>
                </div>
              </Link>
            );
          })}

          <form
            action={agregarPropiedad}
            className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-4"
          >
            <input type="hidden" name="organizacion_id" value={membresia.organizacion_id} />
            <h2 className="font-bold">Agregar propiedad</h2>
            <Campo nombre="nombre" etiqueta="Nombre" placeholder="Casa 14, Jurica" requerido />
            <Campo nombre="direccion" etiqueta="Calle y número" placeholder="Paseo de Jurica 14" />
            <Campo nombre="colonia" etiqueta="Colonia" placeholder="Jurica" />
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Tipo
              <select name="tipo" className="min-h-11 rounded-xl border border-borde bg-white px-3 font-normal">
                {TIPOS.map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
            <Campo nombre="renta" etiqueta="Renta mensual" placeholder="$18,000" />
            <Boton enviando="Agregando…">+ Agregar</Boton>
          </form>
        </section>
      </main>
    </div>
  );
}

function Campo({
  nombre,
  etiqueta,
  placeholder,
  requerido,
}: {
  nombre: string;
  etiqueta: string;
  placeholder?: string;
  requerido?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {etiqueta}
      <input
        name={nombre}
        required={requerido}
        placeholder={placeholder}
        className="min-h-11 rounded-xl border border-borde px-3 font-normal outline-none focus:border-verde"
      />
    </label>
  );
}

function CrearOrganizacion({ email }: { email: string }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-fondo px-4 py-16">
      <form action={crearOrganizacion} className="w-full max-w-md rounded-3xl bg-white p-8">
        <p className="text-sm text-gris">{email}</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">¿Cómo se llama tu administradora?</h1>
        <p className="mt-2 text-sm text-gris">Si apenas empiezas, pon tu nombre. Lo puedes cambiar después.</p>
        <input
          name="nombre"
          required
          placeholder="Administraciones Jurica"
          className="mt-6 min-h-12 w-full rounded-xl border border-borde px-4 outline-none focus:border-verde"
        />
        <Boton enviando="Creando…" className="mt-3 w-full">
          Empezar
        </Boton>
      </form>
    </main>
  );
}

function Configurar() {
  return (
    <main className="flex flex-1 items-center justify-center bg-fondo px-4 py-16">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Falta conectar Supabase</h1>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>Corre los archivos de <code>supabase/migrations/</code>, en orden, en el SQL Editor de tu proyecto.</li>
          <li>
            Copia <code>.env.example</code> a <code>.env.local</code> y llena la URL, la llave publicable y la service_role.
          </li>
          <li>
            Reinicia con <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
