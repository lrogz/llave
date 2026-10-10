import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Black Key · Administra tus propiedades sin Excel ni chats sueltos",
  description:
    "Propiedades, reportes de mantenimiento con fotos, proveedores, cobros de renta y reportes al dueño en una sola app. Gratis hasta 3 propiedades.",
};

const FUNCIONES = [
  { t: "Tu cartera de un vistazo", d: "Qué casa está rentada, cuál vacía y cuál tiene un problema. Importa tu Excel en un minuto." },
  { t: "Reportes con fotos y video", d: "El inquilino escanea el QR de su casa y reporta desde el celular, sin descargar nada." },
  { t: "Tus proveedores de siempre", d: "Cotizan a distancia viendo la evidencia o agendan visita. Comparas lado a lado." },
  { t: "El dueño aprueba en un clic", d: "Recibe un link con fotos y la cotización recomendada. Sin llamadas." },
  { t: "Rentas y servicios al corriente", d: "Cobros automáticos, recargos, link de pago y comprobantes. Luz, agua y predial vigilados." },
  { t: "Dueños e inquilinos en orden", d: "Historial, notas, pendientes, contratos por vencer y documentos de cada persona." },
  { t: "Reporte mensual al dueño", d: "Rentas, trabajos con antes y después, gastos y saldo. Se arma solo." },
  { t: "Tu día resuelto", d: "Panel Hoy con lo urgente, avisos automáticos por correo y tiempos de respuesta." },
];

const PASOS = [
  ["Inquilino", "Escanea el QR y manda fotos o video del problema."],
  ["Tú", "Lo ves en Hoy e invitas a tus proveedores con un clic."],
  ["Proveedores", "Ven la evidencia y cotizan desde su celular."],
  ["Tú", "Comparas y mandas la mejor al dueño."],
  ["Dueño", "Aprueba con un botón."],
  ["Proveedor", "Hace el trabajo; lo cierras con foto de cómo quedó."],
  ["Todos", "El inquilino ve su reporte resuelto y el dueño lo recibe en su reporte del mes."],
];

const PREGUNTAS = [
  ["¿Mis inquilinos, dueños o proveedores tienen que descargar algo?", "No. Les llega un link por WhatsApp o correo y lo abren en su celular, sin crear cuenta."],
  ["¿Tengo que usar proveedores de Black Key?", "No. Trabajas con tus proveedores de siempre. Si alguna vez no tienes uno, puedes pedir sugerencias."],
  ["¿Puedo pasar mi información de Excel?", "Sí. Subes tu archivo tal como lo tienes y la app reconoce las columnas: propiedades, dueños, rentas y teléfonos."],
  ["¿Mi asistente puede usarla?", "Sí. Invitas a tu equipo con su propio acceso y decides quién puede borrar o invitar."],
  ["¿Mi información está segura?", "Cada administradora ve únicamente lo suyo. Los links para inquilinos, dueños y proveedores solo muestran lo que les toca."],
  ["¿Cómo cancelo?", "Cuando quieras, desde la app. Sin plazos forzosos."],
];

export default function Conoce() {
  return (
    <div className="flex flex-1 flex-col bg-fondo text-tinta">
      <header className="sticky top-0 z-30 border-b border-borde-suave bg-fondo/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Logo />
          <nav className="flex items-center gap-2 text-sm font-bold">
            <Link href="/login" className="flex min-h-10 items-center rounded-xl px-3 hover:bg-white">
              Entrar
            </Link>
            <Link href="/registro" className="flex min-h-10 items-center rounded-xl bg-tinta px-4 text-white">
              Crear cuenta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Portada */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="text-sm font-bold tracking-wide text-verde uppercase">Para administradoras de propiedades en México</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">Tus propiedades, sin Excel ni 20 chats de WhatsApp.</h1>
            <p className="mt-5 max-w-xl text-lg text-gris">
              Reportes con fotos, tus proveedores cotizando, el dueño aprobando en un clic y las rentas al corriente. Todo en una sola app, bonita y fácil.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/registro" className="flex min-h-12 items-center rounded-xl bg-verde px-6 font-bold text-white">
                Pruébala 30 días gratis
              </Link>
              <a href="#como-funciona" className="flex min-h-12 items-center rounded-xl border border-borde bg-white px-6 font-bold">
                Ver cómo funciona
              </a>
            </div>
            <p className="mt-3 text-sm text-gris">Gratis para siempre hasta 3 propiedades. Sin tarjeta para empezar.</p>
          </div>

          {/* Vista de la app (ilustrativa) */}
          <div aria-hidden="true" className="rounded-3xl bg-tinta p-4 shadow-xl">
            <div className="rounded-2xl bg-fondo p-4">
              <p className="text-xs font-bold text-gris">#14 · Humedad · Casa Cumbres 8</p>
              <p className="mt-1 font-display text-xl font-bold">Mancha en la recámara</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-lg bg-[#B9A58C]" />
                <div className="aspect-square rounded-lg bg-[#9C8A73]" />
                <div className="aspect-square rounded-lg bg-[#CDBFAE]" />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {[
                  ["Raúl G. Plomería", "$2,400", "Mejor precio", "bg-verde-claro text-verde-oscuro"],
                  ["Impermeabilizantes QRO", "$2,950", "Más rápido", "bg-[#E8EEFB] text-[#2A4A93]"],
                  ["Mantenimiento Jurica", "$3,100", "★ 4.9", "bg-[#FFF4E0] text-[#7A4E00]"],
                ].map(([n, m, b, c]) => (
                  <div key={n} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm">
                    <span className="font-semibold">{n}</span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{b}</span>
                      <span className="font-mono font-bold">{m}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-verde px-3 py-2.5 text-center text-sm font-bold text-white">Mandar al dueño para aprobar</div>
            </div>
          </div>
        </section>

        {/* Dolor */}
        <section className="bg-tinta text-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-12 sm:grid-cols-3">
            {[
              ["Fotos perdidas en el chat", "Cada problema llega por WhatsApp y se pierde entre mensajes."],
              ["Dueños que preguntan \"¿cómo va mi casa?\"", "Y tú armando reportes a mano cada mes."],
              ["Rentas y recibos en Excel", "Sin saber a tiempo quién pagó, quién no y qué vence."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="font-display text-xl font-bold text-menta">{t}</p>
                <p className="mt-1 text-[#C9D6D0]">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Funciones */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Todo lo que haces hoy, en un solo lugar</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FUNCIONES.map((f) => (
              <li key={f.t} className="rounded-2xl bg-white p-5">
                <p className="font-bold">{f.t}</p>
                <p className="mt-1 text-sm text-gris">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Un problema resuelto sin una sola llamada</h2>
            <ol className="mt-8 grid gap-3 md:grid-cols-7">
              {PASOS.map(([quien, que], i) => (
                <li key={i} className="flex flex-col gap-2 rounded-2xl bg-fondo p-4">
                  <span className="flex size-8 items-center justify-center rounded-full bg-tinta text-sm font-bold text-menta">{i + 1}</span>
                  <span className="text-xs font-bold tracking-wide text-verde uppercase">{quien}</span>
                  <span className="text-sm">{que}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Precio */}
        <section id="precio" className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid items-center gap-8 rounded-3xl bg-tinta p-8 text-white md:grid-cols-[1fr_auto] md:p-12">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Un precio simple</h2>
              <p className="mt-2 max-w-xl text-[#C9D6D0]">Pagas solo por las propiedades que administras. Todo incluido: tickets, proveedores, cobros, reportes, avisos y equipo.</p>
              <ul className="mt-5 flex flex-col gap-1.5 text-sm text-[#C9D6D0]">
                <li>✓ Gratis para siempre hasta 3 propiedades</li>
                <li>✓ 30 días de prueba sin límite</li>
                <li>✓ Sin plazos forzosos: cancelas cuando quieras</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-6 text-tinta md:min-w-72">
              <p className="text-sm text-gris">Por propiedad al mes</p>
              <p className="font-display text-5xl font-bold">$110</p>
              <p className="text-sm text-gris">MXN + IVA</p>
              <p className="mt-3 border-t border-borde-suave pt-3 text-sm">
                10 propiedades = <strong>$1,100</strong> al mes
              </p>
              <Link href="/registro" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-verde font-bold text-white">
                Empezar gratis
              </Link>
            </div>
          </div>
        </section>

        {/* Preguntas */}
        <section className="mx-auto max-w-3xl px-5 pb-16">
          <h2 className="font-display text-3xl font-bold tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-6 flex flex-col gap-2">
            {PREGUNTAS.map(([p, r]) => (
              <details key={p} className="group rounded-2xl bg-white p-5">
                <summary className="cursor-pointer list-none font-bold">
                  {p}
                  <span className="float-right text-verde group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-gris">{r}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-verde text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-12">
            <p className="font-display text-3xl font-bold tracking-tight">Ordena tu administración esta semana.</p>
            <Link href="/registro" className="flex min-h-12 items-center rounded-xl bg-white px-6 font-bold text-verde-oscuro">
              Crear mi cuenta gratis
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-gris">
        <Logo />
        <span>Hecho en Querétaro para administradoras de todo México.</span>
      </footer>
    </div>
  );
}
