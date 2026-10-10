# Black Key

**Tus propiedades, tickets y proveedores en un solo lugar. Sin Excel ni WhatsApps sueltos.**

Herramienta para quien administra propiedades en México (y para quien apenas empieza): cartera visual, reportes con fotos y video, cotizaciones de tus proveedores de siempre o de la red, aprobación del dueño, bandeja única de WhatsApp, cobro de rentas y servicios al corriente.

## El flujo central (ya funciona)

1. **Reporte:** el inquilino escanea el QR de la casa, elige el tipo de problema, toma fotos o graba video y marca cuándo pueden entrar. Sin cuenta ni app.
2. **Cotización:** desde el ticket mandas un link por WhatsApp a tus proveedores de siempre, o subes tú la cotización que te llegó (PDF, foto o nota de voz).
3. **Proveedor:** ve fotos y video y elige: cotizar con lo que ve (precio, materiales, garantía, fechas), agendar visita para cotizar, o "no es mi especialidad".
4. **Comparación:** cotizaciones lado a lado con *Mejor precio*, *Más rápido* y *Mejor calificado*.
5. **Aprobación:** eliges una, defines quién paga y el dueño aprueba o rechaza desde un link. Si tienes su autorización, puedes aprobar tú.
6. **Cierre:** marcas resuelto y calificas; el proveedor suma el trabajo y la calificación. El inquilino ve el avance en su link.

| Pantalla | Ruta | Quién la usa |
| --- | --- | --- |
| Hoy: lo que necesita atención | `/hoy` | Administradora |
| Propiedades | `/` | Administradora |
| Personas: dueños e inquilinos | `/personas` | Administradora |
| Ficha del dueño / inquilino | `/personas/duenos/[id]`, `/personas/inquilinos/[id]` | Administradora |
| Ficha con QR imprimible | `/propiedades/[id]` | Administradora |
| Importar cartera desde Excel/CSV | `/propiedades/importar` | Administradora |
| Tickets | `/tickets` | Administradora |
| Ticket y comparación | `/tickets/[id]` | Administradora |
| Pagos: rentas del mes | `/pagos` | Administradora |
| Proveedores y su ficha | `/proveedores`, `/proveedores/[id]` | Administradora |
| Documentos | `/documentos` | Administradora |
| Pago de renta y comprobante | `/p/[token]` | Inquilino (sin cuenta) |
| Reporte mensual del dueño | `/e/[token]` | Dueño (sin cuenta) |
| Reportar un problema | `/r/[codigo]` | Inquilino (desde el QR) |
| Avance del reporte | `/t/[token]` | Inquilino |
| Cotizar o agendar visita | `/c/[token]` | Proveedor |
| Aprobar cotización | `/a/[token]` | Dueño |

## Qué hay en este repo

| Carpeta | Contenido |
| --- | --- |
| `src/` | App en Next.js 16 + Supabase |
| `supabase/migrations/` | Esquema de la base de datos con seguridad por administradora (RLS) |
| `design/` | Pantallas del mockup (formato del canvas de diseño de Claude; no se abren solas en el navegador) |

## Poner en marcha

### 1. Base de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor** corre, en orden y una sola vez cada uno:
   1. `supabase/migrations/20261007120000_esquema_inicial.sql`
   2. `supabase/migrations/20261008040000_folio_por_administradora.sql`
   3. `supabase/migrations/20261010060000_crm_seguimiento.sql`
   4. `supabase/migrations/20261010070000_reporte_dueno.sql`
   5. `supabase/migrations/20261010080000_cobro_rentas.sql`
   6. `supabase/migrations/20261010090000_servicios_documentos.sql`
3. En **Authentication › URL Configuration** agrega `http://localhost:3000/auth/callback` (y luego tu dominio) en *Redirect URLs*.

### 2. App

```bash
cp .env.example .env.local
npm install
npm run dev                  # http://localhost:3000
```

Variables (Supabase › Project Settings › API):

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave publicable (o la anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor. La usan las páginas por link (`/r`, `/t`, `/c`, `/a`), siempre filtrando por token. **Nunca** le pongas prefijo `NEXT_PUBLIC_` ni la subas al repo. |
| `NEXT_PUBLIC_SITE_URL` | Tu dominio público (para los links de WhatsApp). En local se detecta solo. |

### 3. Publicar en Vercel

1. En [vercel.com](https://vercel.com) entra con GitHub → **Add New… › Project** → importa `lrogz/llave`.
2. En **Environment Variables** agrega las 4 (los valores salen de Supabase › Project Settings › API Keys):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreta: solo aquí, nunca en el código ni en el chat)
   - `NEXT_PUBLIC_SITE_URL` = la dirección que te dé Vercel, p. ej. `https://blackkey.vercel.app`
3. **Deploy**. Cada `git push` a `main` vuelve a publicar solo.
4. En Supabase › Authentication › URL Configuration:
   - **Site URL**: la dirección de Vercel.
   - **Redirect URLs**: agrega `https://TU-DIRECCION/auth/callback`.
5. Abre la dirección, entra con tu correo y listo.

Límite de Vercel: cada envío al servidor acepta hasta ~4.5 MB. Las fotos se reducen en el navegador antes de subir; los PDF de cotización y comprobantes deben pesar menos de 4 MB. Las fotos y videos del inquilino (reporte por QR) van directo a Supabase y aceptan hasta 100 MB.

## Seguridad

- Cada administradora solo ve sus datos (RLS con `es_miembro` / `es_admin`), también en archivos: cada una solo sube y lee en su carpeta del bucket `llave`.
- Inquilinos, dueños y proveedores **no tienen cuenta**: entran con links que llevan un token aleatorio de 32 caracteres. Un link ya respondido queda en solo lectura.
- Fotos y videos se suben directo a Storage con URLs firmadas (hasta 6 archivos de 100 MB); las cotizaciones de la administradora, hasta 9 MB.
- Pendiente antes de abrirlo al público: límite de reportes por QR para evitar abuso, y caducidad de links viejos.

## Base de datos

| Área | Tablas |
| --- | --- |
| Administradoras | `organizaciones`, `miembros` |
| Personas | `duenos`, `inquilinos`, `proveedores` (propios o de la red) |
| Cartera | `propiedades` (con código QR), `contratos`, `inspecciones` (check-in/out) |
| Tickets | `tickets`, `ticket_media`, `solicitudes_cotizacion`, `cotizaciones`, `aprobaciones` |
| Pagos y servicios | `cobros_renta`, `servicios`, `recibos_servicio` |
| Bandeja | `conversaciones`, `mensajes` |

## Siguientes pasos

- [x] Reporte por QR con fotos y video
- [x] Link de cotización para proveedores (cotizar a distancia o agendar visita)
- [x] Comparación de cotizaciones y link de aprobación para el dueño
- [ ] Ficha completa: inquilino y contrato; importación desde Excel
- [ ] Fotos de antes y después al cerrar
- [ ] Bandeja de WhatsApp (WhatsApp Business API vía Twilio): mensajes automáticos en vez de abrir WhatsApp a mano
- [ ] Pagos y servicios: recordatorios de renta, comprobantes y semáforo de luz, agua, gas y predial
