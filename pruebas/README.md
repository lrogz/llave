# Pruebas del módulo de condominios

Corren contra un PostgreSQL 15+ local con todas las migraciones. No tocan tu proyecto de Supabase.

```bash
# 1. Base de prueba (usa un Postgres local; crea la base "bk_pruebas")
DATABASE_URL=postgres://postgres@localhost:5432/postgres ./pruebas/preparar-base.sh bk_pruebas

# 2. Pruebas
DATABASE_URL=postgres://postgres@localhost:5432/bk_pruebas npm run test:condominios
```

`supabase-shim.sql` imita lo mínimo de Supabase (roles anon/authenticated/service_role, `auth.uid()`, `auth.jwt()`, esquema `storage` y `pgcrypto` en `extensions`) para que las migraciones corran igual que en Supabase.

## Qué se prueba (41 pruebas)

| Tema | Casos |
| --- | --- |
| Pases QR | válido (entrada con guardia y quién autorizó, una sola salida), expirado, aún no vigente, cancelado, **5 escaneos simultáneos de un QR de un solo uso → 1 entrada**, QR de otro condominio de la misma administradora, recurrente fuera de horario, dispositivo sin el secreto del turno |
| Entrega de turno | mensajes sin responder, paquetes y visitas dentro pasan al turno entrante; el turno anterior ya no puede operar; registro sin conexión reenviado 3 veces queda 1 vez y pendiente de revisión |
| Quejas | queja privada visible para la admin, invisible para staff y comité; responsable y fecha en historial; el vecino la reabre; otro vecino no la ve |
| Saldos y pagos | saldo con varios cargos + saldo inicial + ajuste a favor + pago confirmado (el pendiente no cuenta); **confirmación reintentada en paralelo → un solo folio y un solo descuento**; envío del residente repetido no duplica; cargar cuota dos veces no duplica |
| Permisos y aislamiento | inquilino sin permiso no ve cuenta ni registra pagos; el residente solo ve su vivienda; la caseta no ve dinero ni quejas ni viviendas de otro condominio; otra administradora no ve ni escribe; los links no se pueden usar desde el navegador (anon) ni con sesión |
| Altas | INE + selfie: vivienda de otro condominio y rutas ajenas rechazadas; al aprobar se crea el residente y se borran las fotos |
| Amenidades y mudanzas | último lugar del gimnasio con 3 reservas simultáneas → 1 confirmada y 2 en espera; al cancelar se ofrece el lugar al primero y al aceptar queda confirmada; salón: renta + depósito al estado de cuenta y devolución; mudanzas que chocan por elevador |
| Seguridad | vetado con pase QR no entra y alerta; vetado manual en línea se bloquea y sin conexión se registra con alerta; foto solo con rutas del condominio; placas: residente abre, visita con pase abre y consume el pase, desconocida y vetada no abren; timbre: avisa, el residente autoriza, caseta registra con el pase de 30 min, otro residente no responde y hay freno de abuso; rondín solo con puntos propios; PIN de entrega de un solo uso y bloqueo tras 10 intentos |
| Comunidad | un voto por vivienda, inquilino sin voto si es solo de propietarios, resultados por indiviso; tablero con respuestas sin teléfonos y solo el autor oculta; documentos ocultos no se entregan |
| Conciliación | sugiere el pago del mismo monto y la vivienda del concepto; confirmar dos veces no duplica; otra administradora no ve sugerencias |
| Piloto: pases y fiestas | el invitado abre su pase sin cuenta y solo ve datos de acceso; la caseta de otro condominio no lo valida; un pase por invitado con cajones para los primeros; quitar uno no afecta a los demás; máximos de invitados y cajones; servicio fuera del horario de la regla se rechaza; el trabajo autorizado y el folio llegan a caseta |
| Piloto: cajones | pases simultáneos nunca reciben el mismo cajón; sin cajones libres se rechaza; al salir se libera |
| Piloto: paquetería y turno | dos guardias confirman el mismo paquete → solo uno; recogida por tercero con PIN de un solo uso, revocable y solo en su condominio; el paquete pendiente pasa al turno entrante, que confirma recepción; aclaraciones en indicadores |
| Piloto: incidentes | tres folios de falta de agua se agrupan, conservan su folio, reciben el avance general sin nombres de otras viviendas; se puede separar uno |
| Piloto: obras | la cuota de obra se reparte sin duplicarse y lo recaudado sube con el pago aplicado a lo más antiguo |
