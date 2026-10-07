# Llave

**Tus propiedades, tickets y proveedores en un solo lugar. Sin Excel ni WhatsApps sueltos.**

Herramienta para quien administra propiedades en México (y para quien apenas empieza): cartera visual, reportes con fotos y video, cotizaciones de tus proveedores de siempre o de la red, aprobación del dueño, bandeja única de WhatsApp, cobro de rentas y servicios al corriente.

## El flujo central

1. **Reporte:** el inquilino escanea el QR de la casa o escribe por WhatsApp; sube fotos y video.
2. **Cotización:** mandas el link a tus proveedores de siempre (sin cuenta ni app) o subes tú la cotización (PDF, foto o nota de voz). La red Llave es opcional.
3. **Comparación:** precio, calificación, fecha, garantía e historial lado a lado.
4. **Aprobación:** el dueño aprueba desde un link.
5. **Cierre:** fotos antes/después, calificación y gasto registrado en la propiedad.

## Qué hay en este repo

| Carpeta | Contenido |
| --- | --- |
| `src/` | App en Next.js 16 + Supabase: acceso con link mágico, alta de administradora y cartera de propiedades |
| `supabase/migrations/` | Esquema completo de la base de datos con seguridad por administradora (RLS) |
| `design/` | Pantallas del mockup (formato del canvas de diseño de Claude; no se abren solas en el navegador) |

## Poner en marcha

### 1. Base de datos (Supabase)

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. Abre **SQL Editor**, pega todo el archivo `supabase/migrations/20261007120000_esquema_inicial.sql` y dale **Run**. Córrelo una sola vez.
3. En **Authentication › URL Configuration** agrega `http://localhost:3000/auth/callback` (y luego tu dominio) en *Redirect URLs*.

### 2. App

```bash
cp .env.example .env.local   # llena URL y llave publicable (Project Settings › API)
npm install
npm run dev                  # http://localhost:3000
```

Nunca pongas la llave `service_role` en `.env.local` del navegador ni la subas al repo.

## Base de datos

| Área | Tablas |
| --- | --- |
| Administradoras | `organizaciones`, `miembros` |
| Personas | `duenos`, `inquilinos`, `proveedores` (propios o de la red) |
| Cartera | `propiedades` (con código QR), `contratos`, `inspecciones` (check-in/out) |
| Tickets | `tickets`, `ticket_media`, `solicitudes_cotizacion`, `cotizaciones`, `aprobaciones` |
| Pagos y servicios | `cobros_renta`, `servicios`, `recibos_servicio` |
| Bandeja | `conversaciones`, `mensajes` |

- Cada administradora solo ve sus datos (RLS con `es_miembro` / `es_admin`).
- Inquilinos, dueños y proveedores **no tienen cuenta**: entran con links que llevan un token (`token_publico`, `token`). Esos links se resuelven en el servidor con la llave `service_role` (pendiente).
- Archivos en el bucket privado `llave`, con ruta `<organizacion_id>/<carpeta>/<archivo>`.

## Siguientes pasos (MVP, 8 semanas)

- [ ] Ficha de propiedad con dueño, inquilino y contrato; importación desde Excel
- [ ] Reporte por QR con fotos y video (página pública con token)
- [ ] Link de cotización para proveedores (cotizar a distancia o agendar visita)
- [ ] Comparación de cotizaciones y link de aprobación para el dueño
- [ ] Bandeja de WhatsApp (WhatsApp Business API vía Twilio)
- [ ] Recordatorios de renta y servicios
