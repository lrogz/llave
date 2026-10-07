import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { agregarPropiedad, crearOrganizacion, salir } from "./actions";

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

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export default async function Inicio() {
  await connection(); // siempre se arma por request: depende de la sesión
  if (!supabaseConfigurado) return <Configurar />;

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
      <Menu nombreOrg={org?.nombre ?? ""} />

      <main className="min-w-0 flex-[999_1_560px] px-5 py-8 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">
              {propiedades.length} {propiedades.length === 1 ? "propiedad" : "propiedades"}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">Mis propiedades</h1>
          </div>
        </header>

        <section aria-label="Propiedades" className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {propiedades.map((p) => {
            const n = abiertos(p);
            const estado = ESTADOS[p.estado];
            return (
              <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-white">
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
              </article>
            );
          })}

          <form
            action={agregarPropiedad}
            className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-4"
          >
            <input type="hidden" name="organizacion_id" value={membresia.organizacion_id} />
            <h2 className="font-bold">Agregar propiedad</h2>
            <Campo nombre="nombre" etiqueta="Nombre" placeholder="Casa 14, Jurica" requerido />
            <Campo nombre="direccion" etiqueta="Dirección" placeholder="Calle, número, colonia" />
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
            <button type="submit" className="min-h-11 rounded-xl bg-verde font-bold text-white">
              + Agregar
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Menu({ nombreOrg }: { nombreOrg: string }) {
  const items = ["Propiedades", "Tickets", "Bandeja", "Proveedores", "Pagos y servicios", "Documentos"];
  return (
    <nav aria-label="Secciones" className="flex max-w-64 min-w-52 flex-[1_1_220px] flex-col gap-7 bg-tinta px-4 py-7 text-[#C9D6D0]">
      <div className="flex items-center gap-2.5 px-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-menta">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14201C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l9-9M17 6l3 3" />
          </svg>
        </span>
        <span className="font-display text-2xl font-bold text-white">Llave</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item, i) => (
          <li key={item}>
            <span
              className={
                i === 0
                  ? "block rounded-xl bg-menta px-3 py-3 font-bold text-tinta"
                  : "block rounded-xl px-3 py-3"
              }
              aria-current={i === 0 ? "page" : undefined}
            >
              {item}
              {i > 0 && <span className="ml-2 text-xs text-[#7F918A]">pronto</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2 px-2.5 text-sm">
        <span className="font-semibold text-white">{nombreOrg}</span>
        <form action={salir}>
          <button type="submit" className="text-[#A9BAB2] underline">
            Salir
          </button>
        </form>
      </div>
    </nav>
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
        <button type="submit" className="mt-3 min-h-12 w-full rounded-xl bg-verde font-bold text-white">
          Empezar
        </button>
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
          <li>Corre <code>supabase/migrations/…_esquema_inicial.sql</code> en el SQL Editor de tu proyecto.</li>
          <li>
            Copia <code>.env.example</code> a <code>.env.local</code> y llena la URL y la llave publicable.
          </li>
          <li>
            Reinicia con <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
