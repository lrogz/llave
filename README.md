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
| Página de venta (sin sesión) | `/conoce`, `/registro` | Público |
| Hoy: lo que necesita atención | `/hoy` | Administradora |
| Plan y pago | `/plan` | Administradora |
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
| Equipo e invitaciones | `/equipo`, `/unirme/[token]` | Administradora / invitada |
| Pago de renta y comprobante | `/p/[token]` | Inquilino (sin cuenta) |
| Reporte mensual del dueño | `/e/[token]` | Dueño (sin cuenta) |
| Reportar un problema | `/r/[codigo]` | Inquilino (desde el QR) |
| Avance del reporte | `/t/[token]` | Inquilino |
| Cotizar o agendar visita | `/c/[token]` | Proveedor |
| Aprobar cotización | `/a/[token]` | Dueño |
| Condominios y su panel | `/condominios`, `/condominios/[id]` | Administradora |
| Portal del residente | `/vecino/[token]` | Residente (sin cuenta) |
| Caseta (escáner, chat, paquetes, turno) | `/caseta/[token]` | Guardia con PIN |
| Reporte del comité | `/comite/[token]` | Comité |
| Alta de residente con INE y selfie | `/alta/[token]` | Residente nuevo |
| Pase de la visita | `/pase/[codigo]` | Visita |
| Timbre por QR en la entrada | `/timbre/[token]` | Visita |
| Tablet del cuarto de paquetes | `/kiosco/[token]` | Repartidor |
| Cámara de placas (API) | `POST /api/condominios/lpr` | Cámara LPR |

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
   7. `supabase/migrations/20261010100000_equipo.sql`
   8. `supabase/migrations/20261010110000_avisos.sql`
   9. `supabase/migrations/20261010120000_planes.sql`
   10. `supabase/migrations/20261014090000_liquidaciones.sql`
   11. `supabase/migrations/20261014100000_whatsapp.sql`
   12. `supabase/migrations/20261014110000_anuncios.sql`
   13. `supabase/migrations/20261014120000_entregas_mantenimiento.sql`
   14. `supabase/migrations/20261014130000_cobro_contratos_solicitudes.sql`
   15. `supabase/migrations/20261014140000_facturacion.sql`
   16. `supabase/migrations/20261014150000_red_agenda.sql`
   17. `supabase/migrations/20261014160000_push.sql`
   18. `supabase/migrations/20261014170000_push_proveedores.sql`
   19. `supabase/migrations/20261015090000_inpc_aumentos.sql`
   20. `supabase/migrations/20261015100000_cobro_automatico.sql`
   21. `supabase/migrations/20261015110000_reparto_pagos.sql`
   22. `supabase/migrations/20261015120000_planes_por_nivel.sql`
   23. `supabase/migrations/20261112120000_condominios.sql`
   24. `supabase/migrations/20261113090000_condominios_seguridad_comunidad.sql`
   25. `supabase/migrations/20261115090000_condominios_piloto.sql`
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

### 4. Avisos automáticos por correo (opcional)

1. Crea una cuenta en [resend.com](https://resend.com) y verifica un dominio tuyo (Domains › Add domain, agrega los registros DNS).
2. Crea una API key (API Keys › Create).
3. En Vercel › Settings › Environment Variables agrega:
   - `RESEND_API_KEY` = la llave de Resend
   - `AVISOS_REMITENTE` = `Black Key <avisos@tudominio.mx>`
   - `CRON_SECRET` = cualquier texto largo y secreto
4. Redeploy. Cada mañana (8:00 a. m. de CDMX) corre `/api/cron/avisos` (ver `vercel.json`).
5. Para que los correos de entrada (link mágico) no se topen con el límite gratuito de Supabase, en Supabase › Authentication › Emails › SMTP Settings usa: host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = tu API key, remitente del mismo dominio.

Mientras tanto se puede entrar con **correo y contraseña** (Ajustes › Tu contraseña).

### 5. Cobro de la suscripción con Stripe (opcional)

Planes (se cambian en `src/lib/planes.ts`): **Gratis** hasta 2 propiedades · **Inicial** $890/mes hasta 10 · **Profesional** $1,890/mes hasta 30 · **Agencia** $3,890/mes hasta 80 (más IVA). Más de 80: plan a la medida.

1. Crea tu cuenta en [stripe.com](https://stripe.com) (México) y activa los pagos.
2. Products › crea 3 productos (Inicial, Profesional, Agencia), cada uno con un precio **recurrente mensual** fijo ($890, $1,890 y $3,890 MXN + IVA). Copia cada `price_…`.
3. Developers › API keys › copia la **Secret key** (`sk_live_…`).
4. Developers › Webhooks › Add endpoint: `https://TU-DIRECCION/api/stripe/webhook` con los eventos
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copia el **Signing secret** (`whsec_…`).
5. Settings › Billing › Customer portal: actívalo (para que cambien tarjeta, vean facturas o cancelen) y en cancelaciones elige **"al final del periodo de facturación"** (así lo dicen los términos).
6. En Vercel agrega `STRIPE_SECRET_KEY`, `STRIPE_PRICE_INICIAL`, `STRIPE_PRICE_PROFESIONAL`, `STRIPE_PRICE_AGENCIA`, `STRIPE_WEBHOOK_SECRET` y Redeploy.
7. Customer portal › permite **cambiar de plan** entre esos 3 precios (opcional; también se cambia desde la app).

Sin estas variables la app funciona igual; la pantalla Plan solo dice que los pagos no están conectados.

### 6. Aviso de privacidad y términos

Están en `/privacidad` y `/terminos` (ligados desde la página de venta, el registro y los formularios del inquilino). Antes de cobrar:

1. En Vercel agrega `LEGAL_RESPONSABLE` (tu nombre o razón social), `LEGAL_DOMICILIO` y `LEGAL_CORREO` y Redeploy.
2. Pide a un abogado que los revise; son una base, no asesoría legal.

### 7. WhatsApp automático (opcional)

Un número de WhatsApp Business para Black Key: manda los avisos (renta, vencida, reporte al dueño, renovación, servicios) y recibe reportes de los inquilinos (texto, fotos, video, audio → ticket con link de seguimiento).

1. Consigue un número que **no** esté usando la app de WhatsApp (uno nuevo o uno que des de baja ahí).
2. [developers.facebook.com](https://developers.facebook.com) › Create app › tipo **Business** › agrega el producto **WhatsApp** y liga tu portafolio comercial (Meta Business). Verifica el negocio para subir los límites de envío.
3. WhatsApp › API Setup: agrega tu número y copia el **Phone number ID** (`WHATSAPP_PHONE_ID`).
4. Token permanente: Business Settings › Users › System users › Add (Admin) › Generate token con `whatsapp_business_messaging` y `whatsapp_business_management` (`WHATSAPP_TOKEN`).
5. App settings › Basic › **App secret** (`WHATSAPP_APP_SECRET`).
6. WhatsApp Manager › Message templates › crea estas 5, categoría **Utility**, idioma **Spanish (MEX)**, con el texto idéntico:

   | Nombre | Texto |
   | --- | --- |
   | `bk_aviso_renta` | Hola {{1}}, te escribimos de {{2}}. La renta de {{3}} por {{4}} vence el {{5}}. Aquí ves los datos para depositar y puedes subir tu comprobante: {{6}} ¡Gracias! |
   | `bk_renta_vencida` | Hola {{1}}, te escribimos de {{2}}. La renta de {{3}} por {{4}} venció el {{5}}. Si ya pagaste, sube tu comprobante aquí: {{6}} ¡Gracias! |
   | `bk_reporte_dueno` | Hola {{1}}, te escribimos de {{2}}. Ya está tu reporte de {{3}}: rentas, trabajos con fotos y tu saldo. Puedes verlo aquí: {{4}} Saludos. |
   | `bk_renovacion` | Hola {{1}}, te escribimos de {{2}}. Tu contrato de {{3}} termina el {{4}}. ¿Te gustaría renovar? Responde este mensaje y te compartimos las condiciones. |
   | `bk_cita` | Hola {{1}}, te escribimos de {{2}}. {{3}} irá a {{4}} el {{5}} para atender: {{6}}. Si no puedes recibirlo, responde este mensaje. |
   | `bk_cita_proveedor` | Hola {{1}}, tienes una visita de {{2}}: {{3}} en {{4}}, el {{5}}. Detalles, cómo llegar y botón de Llegué/Terminé: {{6}} |
   | `bk_aumento_renta` | Hola {{1}}, te escribimos de {{2}}. Tu contrato de {{3}} se renovó hasta el {{4}}. A partir del {{5}} la renta será de {{6}}. Aquí ves el detalle del cálculo: {{7}} |
   | `bk_cobro_fallido` | Hola {{1}}, te escribimos de {{2}}. No pudimos cobrar la renta de {{3}} por {{4}} a tu tarjeta. Puedes pagar o cambiar tu tarjeta aquí: {{5}} |
   | `bk_servicio` | Hola {{1}}, te escribimos de {{2}}. El recibo de {{3}} de {{4}} vence el {{5}}. Te lo recordamos para que no se generen recargos. |

7. En Vercel agrega `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` (un texto que tú inventes) y Redeploy.
8. WhatsApp › Configuration › Webhook: Callback URL `https://TU-DIRECCION/api/whatsapp`, Verify token = el mismo `WHATSAPP_VERIFY_TOKEN` › Verify and save › en Webhook fields suscribe **messages**.
9. Prueba: escribe al número desde el celular de un inquilino registrado (con contrato activo) → se crea el ticket y le responde con su link. En Ajustes › Avisos automáticos debe decir "WhatsApp conectado ✓".

Costos: Meta cobra los mensajes de plantilla (avisos); las respuestas del bot dentro de las 24 h después de que el inquilino escribe no llevan plantilla. Revisa la tarifa vigente para México en Meta.

### 8. Facturación CFDI de rentas con Facturapi (opcional)

Cada **dueño** factura su renta con su propio sello digital (CSD); Black Key crea un emisor por dueño en Facturapi y timbra por él.

1. Crea tu cuenta en [facturapi.io](https://www.facturapi.io) y copia tu **llave secreta de usuario** (`sk_user_…`, en Cuenta › API Keys).
2. En Vercel agrega `FACTURAPI_KEY` = esa llave. Para probar sin timbrar de verdad agrega también `FACTURAPI_MODO=test`. Redeploy.
3. En la ficha del dueño › "Facturación de sus rentas": RFC, razón social (como en su constancia), régimen (normalmente 606 Arrendamiento) y C.P. fiscal, más su **CSD** (.cer, .key y contraseña; no es la e.firma). La contraseña no se guarda.
4. En la ficha del inquilino › "Datos fiscales" (si pide factura): RFC, razón social, régimen, C.P. y uso. Sin datos se factura a público en general. "Facturar solo" timbra al registrar cada pago.
5. En Pagos: "Facturar" por renta pagada o "Facturar rentas pagadas del mes"; PDF/XML y cancelar.
6. En la propiedad, la **cuenta predial** (va en la factura).

Reglas que aplica (valídalas con tu contador): clave 80131500 / unidad E48; casa habitación sin amueblar = IVA exento; local, oficina o amueblada = IVA 16%; si paga una persona moral, retención de ISR 10% (1.25% si el dueño está en RESICO) y 2/3 del IVA. Facturapi cobra por factura timbrada según su plan.

### 9. Red de proveedores y agenda en línea

- Los proveedores se registran solos en `/red/unirme` (pásales ese link). Quedan "en revisión" y reciben su link personal `/pro/…`: ahí ponen su horario, suben INE, comprobante de domicilio y fotos, y ven sus citas con botones Llegué / Terminé.
- En Vercel agrega `PLATAFORMA_ADMINS` = tus correos separados por coma. Esas cuentas entran a `/red/admin` para aprobar o rechazar (y reciben un correo por cada solicitud).
- Los aprobados aparecen en Proveedores › "Ver toda la red" (filtros por especialidad y zona) y en el selector de cada ticket.
- En el ticket, "Visita del proveedor": agenda en un horario libre del proveedor (nunca dos visitas a la misma hora, aunque sean de otras administradoras) o manda al inquilino un link `/agenda/…` para que él elija. El inquilino puede guardarla en su calendario.
- Un día antes sale recordatorio al inquilino (correo y WhatsApp) y al proveedor (WhatsApp). Se apaga en Ajustes › "Recordatorio de visitas".

### 10. App instalable y notificaciones push

1. En tu compu corre `npx web-push generate-vapid-keys` (una sola vez; no las compartas por chat).
2. En Vercel agrega `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (la pública), `VAPID_PRIVATE_KEY` (la privada) y `VAPID_SUBJECT` = `mailto:tu@correo`. Redeploy. Si cambias las llaves, todos tienen que volver a activar avisos.
3. Cada persona del equipo: Ajustes › "Black Key en tu celular" › Instalar (Android/compu) o Compartir › Agregar a inicio (iPhone, iOS 16.4+), y luego "Activar notificaciones" desde la app instalada.

Proveedores: su portal `/pro/…` también se instala ("Mi agenda") y les avisa de trabajos nuevos para cotizar, cotizaciones aprobadas, visitas agendadas o canceladas y el recordatorio un día antes. Usa las mismas llaves.

Avisan al instante: reporte nuevo (QR o WhatsApp), comprobante de pago, cotización recibida, respuesta del dueño, interesado en un anuncio, solicitud de renta, firma de contrato y horario elegido por el inquilino.

### 11. Aumento de renta por inflación (INPC)

1. Pide tu token gratis del INEGI: inegi.org.mx › Servicios › API de Indicadores › "Obtén tu token".
2. En Vercel agrega `INEGI_TOKEN`. El cron diario trae el INPC oficial (Índice general, base 2Q jul 2018 = 100; indicador `628194` de la fuente BIE, cambiable con `INEGI_INPC_ID` / `INEGI_FUENTE`). Sin token se usan los valores de referencia que trae la migración 19: verifícalos.
3. En la ficha del inquilino › Contrato › "Cómo sube la renta": INPC (+ puntos extra), % fijo o sin aumento, con tope opcional.
4. "Renovar" sugiere la renta nueva: INPC del último mes publicado antes de que entre la renta nueva ÷ el del mismo mes del año anterior. Programa la renta desde esa fecha (los cobros salen solos con el monto nuevo) y avisa al inquilino con una carta `/n/…` que muestra el cálculo.

### 12. Cobro automático de rentas (Stripe Connect)

El dinero de las rentas llega a la cuenta de Stripe **de cada administradora** (cargos directos); Black Key no lo toca.

1. En tu cuenta de Stripe (la misma de la suscripción) activa **Connect** y, en Ajustes › Métodos de pago, **Transferencias bancarias (México)** y **OXXO**.
2. En Developers › Webhooks crea un endpoint para **cuentas conectadas** ("Events on Connected accounts") a `https://TU-DOMINIO/api/stripe/webhook` con: `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `account.updated`. Copia su secreto a `STRIPE_CONNECT_WEBHOOK_SECRET` en Vercel.
3. Opcional: `STRIPE_COMISION_PCT` (p. ej. `1`) para cobrar una comisión de plataforma por cada renta.
4. Cada administradora: Ajustes › "Cobro automático de rentas" › Conectar mi cuenta de Stripe (Stripe le pide INE, RFC y cuenta bancaria).
5. El inquilino, en su link de pago: "Pagar" (tarjeta, SPEI con CLABE única que se concilia sola, u OXXO hasta $10,000) o "Activar pago automático" (guarda su tarjeta; el cron la cobra el día de pago, hasta 3 intentos cada 2 días, y le avisa si se rechaza).

Stripe no ofrece domiciliación bancaria en México; el pago automático es con tarjeta. Revisa las tarifas vigentes en stripe.com/mx/pricing.

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
- [x] WhatsApp automático (Cloud API de Meta): avisos con plantillas y reportes del inquilino por WhatsApp
- [ ] Bandeja de WhatsApp: ver y contestar las conversaciones desde la app
- [ ] Pagos y servicios: recordatorios de renta, comprobantes y semáforo de luz, agua, gas y predial

### 11. Condominios y privadas

Módulo para administrar privadas y condominios con lo que ya tiene Black Key: los reportes de vecinos son tickets (cotizaciones, proveedores, aprobación), los gastos usan tus proveedores y el condominio cuenta como **una propiedad** del plan (sus áreas comunes).

**Poner en marcha**
1. Corre las migraciones 23, 24 y 25 (en ese orden) en Supabase › SQL Editor. No necesitan variables nuevas.
2. En la app: **Condominios › Cargar condominios de ejemplo** (2 comunidades ficticias, guardias con PIN `1234`) o **Nuevo condominio**.
3. En el condominio › *Viviendas y residentes*: crea viviendas o pega tu padrón desde Excel (vivienda, zona, nombre, celular, tipo, saldo inicial).
4. *Caseta y links*: da de alta guardias con PIN, abre el **link de caseta** en el celular de caseta y agrégalo a la pantalla de inicio. Comparte el **link de alta** en el grupo de vecinos y el **link del comité** con el comité.
5. A cada residente mándale su link personal por WhatsApp desde su vivienda.

**Quién ve qué**

| Rol | Entra con | Ve |
| --- | --- | --- |
| Administradora (propietaria/admin) | Su cuenta | Todo, incluidas quejas privadas |
| Staff de la administradora | Su cuenta | Todo menos quejas privadas |
| Propietario | Link personal | Su vivienda: pases, cuenta, recibos, reportes, chat, paquetes, amenidades, avisos de su zona |
| Inquilino | Link personal | Igual, pero sin estado de cuenta ni pagos salvo que le des el permiso (configurable por persona) |
| Guardia | Link de caseta + PIN | Escáner, bitácora, chat, paquetes, personal autorizado, mudanzas y eventos del día. Nada de dinero ni quejas |
| Comité | Link del comité | Cobranza, gastos, adeudos por vivienda, reportes abiertos (las quejas privadas solo como número) y exportación CSV si lo permites |

Toda la autorización de los links vive en funciones de la base (`vecino_*`, `caseta_*`, `comite_*`): resuelven el token, toman su condominio y vivienda, y nunca devuelven ni cambian nada fuera de ellos. Dos condominios de la misma administradora no se cruzan.

**Cómo funciona por dentro**
- **Pases QR:** código opaco de 12 caracteres, con vigencia, días y horario (recurrentes) y cancelación. La validación bloquea la fila del pase, así que un QR de un solo uso no autoriza dos entradas aunque se escanee al mismo tiempo en dos celulares.
- **Caseta:** cada dispositivo guarda un secreto del turno (la base solo conoce su hash). Al iniciar un turno nuevo se cierra el anterior y sus pendientes (mensajes, paquetes, visitas dentro, esperados, notas) aparecen en *Turno*.
- **Sin internet:** la caseta muestra el estado real. El QR no se puede validar sin conexión; el registro manual se guarda en el teléfono y se envía solo al volver la señal (sin duplicarse), marcado para revisión de la administración. Procedimiento de respaldo: bitácora de papel con hora, nombre, vivienda y quién autorizó.
- **Dinero:** montos en centavos. Saldo = cargos + ajustes − pagos confirmados. Los saldos nunca se editan: se agregan ajustes con motivo. Confirmar un pago dos veces devuelve el mismo recibo (folio por condominio, serie configurable). Cargar la misma cuota dos veces no la duplica. Todo cambio queda en `bitacora_condominio` (sin tokens, PIN ni rutas de archivos).
- **Amenidades:** por turnos (se confirman solas hasta llenar el cupo; si no hay lugar, lista de espera: al cancelar alguien se ofrece el lugar con plazo para confirmar) o con aprobación (salón). Al aprobar, la renta y el depósito se cargan al estado de cuenta; después del evento el depósito se devuelve (ajuste a favor) o se retiene con motivo.
- **Mudanzas:** el vecino pide fecha, empresa, placa y recursos (zona de carga, elevador). Al aprobar se crea un pase QR para la mudanza y caseta la ve en su agenda; no se aprueban dos que usen el mismo recurso a la misma hora.
- **Alta con INE y selfie:** el residente sube frente, reverso y selfie con su consentimiento; la administración las compara y aprueba. **Las imágenes se borran al decidir.** La comparación facial automática no está activa (ver pendientes).
- **Archivos privados** en el bucket `llave` (`<organización>/condominios/<condominio>/…`), servidos con URLs firmadas de 1 hora.

**Seguridad y comunidad (migración 24)**
- **Foto en cada entrada:** después de autorizar, caseta toma la foto (queda en *Accesos*).
- **Vetados y alertas:** nombre o placa con motivo. Si alguien de la lista llega con pase, por timbre, a mano o en auto, la caseta lo ve en rojo, no se registra y llega alerta (push) a la administración. Si entró sin conexión, se registra y se alerta.
- **Timbre por QR:** imprime el QR (*Caseta y links*) y pégalo en la entrada. La visita elige vivienda; el residente recibe aviso y toca *Dejar pasar*: se crea un pase de 30 minutos que la visita ve en su celular y caseta registra.
- **Leer INE en caseta:** foto del reverso; el nombre se lee en el teléfono del guardia (zona MRZ) y la imagen no se guarda ni se envía.
- **Rondines:** puntos con QR imprimibles; el guardia los escanea y la entrega de turno muestra qué falta.
- **Placas (LPR):** los residentes registran sus autos; las visitas con placa en su pase entran solas (configurable). La cámara (o su software) manda cada lectura a `POST /api/condominios/lpr` con el encabezado `x-bk-token`. Placa desconocida → alerta a caseta.
- **Pluma y cuarto de paquetes:** botón *Abrir pluma* en caseta y apertura automática por placa o PIN, llamando a un relevador HTTPS (Shelly Cloud, controlador con API o puente propio). Sin liga configurada queda en **simulación** y se registra igual en *Aperturas*.
- **Códigos de entrega:** el residente genera un PIN de 6 dígitos para el repartidor; se teclea en la tablet del cuarto de paquetes (`/kiosco/…`) o en caseta. Un solo uso, con vencimiento y bloqueo tras 10 intentos fallidos.
- **Votaciones y asambleas:** convocatoria, orden del día, acta, acuerdos con responsable y fecha, y votaciones de un voto por vivienda (resultado por viviendas y por indiviso si lo cargas en el padrón, columna 7).
- **Conciliación bancaria:** sube el CSV del estado de cuenta del condominio; se sugiere el pago por revisar del mismo monto o la vivienda mencionada en el concepto. Confirmar emite el recibo. Volver a subir el mismo archivo no duplica.
- **Documentos y tablero vecinal:** reglamento, actas y pólizas (visibles u ocultos); tablero de recomendaciones, ventas, preguntas y mascotas perdidas, con respuestas dentro de la app sin mostrar teléfonos. La administración puede ocultar publicaciones.
- **Avisos al celular del residente:** con las mismas llaves VAPID de la sección 10, el residente toca *Activar* en su portal y recibe: tocan el timbre, llegó tu visita, llegó tu paquete, caseta te respondió, nueva votación y avisos urgentes. En iPhone debe agregar el portal a inicio primero.

**Piloto: una app que coordina cada llegada (migración 25)**
- **Pases con contexto:** al crear un pase el residente elige *Visita, Servicio, Fiesta o Mudanza*. Cada pase lleva acceso, indicaciones, cajón apartado y (en servicios) el trabajo autorizado. La visita lo ve en su link sin cuenta; caseta lo ve al validar.
- **Reglas de acceso** (*Reglas y cajones*): por tipo de pase, acceso por omisión, horario permitido, duración máxima, invitados y cajones. Se aplican al crear el pase.
- **Fiestas:** un pase de un solo uso por invitado (cada uno se comparte y se quita por separado), cajones para los primeros de la lista y contador de llegadas.
- **Cajones de visita:** se asignan solos sin choques de horario y se liberan al registrar la salida.
- **Folio corto:** cada pase tiene folio (#123). Si la cámara falla, caseta lo escribe o lo busca en *Llegadas de hoy*.
- **Paquetería:** foto, ubicación (anaquel), tiempo de registro, foto de evidencia al entregar y **recogida por otra persona** con PIN de 6 dígitos o link de un solo uso, revocable. Si dos guardias confirman el mismo paquete, solo cuenta el primero.
- **Cambio de turno:** el guardia entrante confirma que recibió el turno (con observaciones) y ve incidencias abiertas, cajones ocupados y paquetes pendientes con su ubicación.
- **Aclaraciones:** botón en caseta para registrar cada llamada que hubo que hacer para aclarar una visita.
- **Incidentes agrupados** (*Incidencias*): se sugieren reportes de la misma categoría y zona en 48 h; al agruparlos cada residente conserva su folio y recibe el avance general en su seguimiento y celular, sin ver quién más reportó.
- **Indicadores del piloto** (*Indicadores* y link del comité): aclaraciones por 100 accesos, mediana llegada → validación, paquetes pendientes al cambio de turno, mediana para registrar paquete, reportes agrupados y tiempo al primer aviso; contra el periodo anterior y en CSV.
- **Bitácora:** filtrable por tipo y por quién.
- **Equipos con QR:** bomba, elevador, portón… El QR abre (para tu equipo) su historial de reportes, gastos, comprobantes y garantía. Liga tickets y gastos al equipo.
- **Obras con cuota:** presupuesto aprobado (y asamblea), etapas, cuota extraordinaria por vivienda o indiviso, recaudado (pagos aplicados a lo más antiguo) y pagado al proveedor. Lo ven residentes y comité.
- **Lista de espera con oferta:** si se libera un lugar, se ofrece al primero con un plazo (configurable por amenidad); si no confirma, pasa al siguiente. Inventario por amenidad que se revisa al cerrar el depósito.
- **Demo "la prueba del sábado"** (se carga con los ejemplos): fiesta de 20 invitados y mudanza el mismo día, servicio con trabajo autorizado, paquete pendiente al cambio de turno, tres avisos de falta de agua para agrupar, cajones, reglas, equipos con historial y una obra.

**Simulaciones y pendientes (no procesa dinero real)**
- Pagos: solo se **registran** transferencias ya hechas a la cuenta del condominio. Conciliación SPEI automática y cobro en línea: siguiente etapa (se puede reutilizar el Stripe Connect de rentas).
- Avisos al residente: aparecen en su portal y la caseta/administración los manda por WhatsApp con un toque (wa.me). Mandarlos solos requiere plantillas nuevas de WhatsApp (p. ej. `bk_paquete`, `bk_pase_aprobado`) y push para residentes.
- Verificación facial automática: requiere un proveedor (Truora, MetaMap, Incode…), su contrato y aviso de privacidad para datos biométricos. Hoy la revisión es manual.
- Pluma y cuarto de paquetes: el software ya llama al relevador; falta instalar el relevador en cada condominio. Lectores de tags RFID: siguiente etapa.
- Videollamada en el timbre: hoy es aviso con nombre, motivo y foto; la llamada con video requeriría un servicio de WebRTC.
- Después del piloto: objetos y mascotas perdidas, contratistas, rentas temporales, cambio de administración e integración opcional con Blooni.

**Pruebas:** `pruebas/README.md` (41 pruebas contra Postgres, incluidas las de aceptación del piloto: QR válido/vencido/cancelado/doble escaneo, entrega de turno, queja privada, saldos, reintento de pago, aislamiento por rol y por condominio, altas, amenidades, mudanzas, vetados, placas, timbre, rondines, PIN de entrega, votaciones, tablero y conciliación).

**Demo de punta a punta (5 minutos)**
1. Condominios › Cargar condominios de ejemplo › entra a *Privada Los Encinos* › *Viviendas* › Casa 1 › copia el link de Ana Ruiz y ábrelo en el celular.
2. Ana: **Crear pase QR** › Crear pase › Compartir por WhatsApp.
3. En otro celular abre *Caseta y links* › link de caseta › Guardia matutino, PIN 1234 › escanea el QR (o escribe el código) → *Acceso autorizado*. Escanéalo otra vez → *Pase ya utilizado*.
4. Administradora: *Accesos* › aparece la entrada con hora, guardia y quién autorizó.
5. Ana: Cuenta › Registrar transferencia. Administradora: *Cuotas y pagos* › Confirmar y emitir recibo → el saldo de Ana baja y ve su recibo.
6. Ana: Reportar › Nuevo reporte. Administradora: el ticket aparece en *Tickets*; pon responsable y resolución y **Cerrar como resuelto** → Ana ve el historial y puede reabrirlo.
