import { FormFiscalDueno, FormFiscalInquilino } from "@/components/Fiscal";
import { formatoFecha } from "@/lib/datos";
import { facturapiConfigurado, modoPruebas } from "@/lib/facturapi";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

// Facturación del dueño: sus datos fiscales y su sello digital (él es quien factura la renta).
export async function SeccionFiscalDueno({ db, duenoId }: { db: Db; duenoId: string }) {
  const { data, error } = await db.from("duenos").select("rfc, razon_social, regimen_fiscal, cp_fiscal, facturacion_lista, csd_vence").eq("id", duenoId).maybeSingle();
  if (error || !data) return null;
  const { count } = await db.from("facturas").select("id", { count: "exact", head: true }).eq("dueno_id", duenoId).eq("estado", "valida");
  return (
    <section aria-label="Facturación" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Facturación de sus rentas (CFDI)</h2>
      {data.facturacion_lista ? (
        <p className="rounded-xl bg-verde-claro p-3 text-sm text-verde-oscuro">
          ✓ Lista para facturar a nombre de {data.razon_social} ({data.rfc}){data.csd_vence ? ` · sello vigente hasta ${formatoFecha(data.csd_vence)}` : ""}
          {count ? ` · ${count} facturas emitidas` : ""}
          {modoPruebas() ? " · MODO PRUEBAS" : ""}
        </p>
      ) : (
        <p className="text-sm text-gris">
          El dueño es quien factura la renta. Con su RFC y su sello digital (CSD), Black Key timbra cada recibo por él, con el IVA y las retenciones que correspondan.
          {!facturapiConfigurado() && " (Falta conectar Facturapi en Vercel.)"}
        </p>
      )}
      <details open={!data.facturacion_lista}>
        <summary className="cursor-pointer text-sm font-semibold text-verde">{data.facturacion_lista ? "Actualizar datos o sello" : "Activar facturación"}</summary>
        <div className="mt-3">
          <FormFiscalDueno duenoId={duenoId} datos={{ rfc: data.rfc ?? "", razon_social: data.razon_social ?? "", regimen_fiscal: data.regimen_fiscal ?? "", cp_fiscal: data.cp_fiscal ?? "" }} />
        </div>
      </details>
    </section>
  );
}

export async function SeccionFiscalInquilino({ db, inquilinoId }: { db: Db; inquilinoId: string }) {
  const { data, error } = await db.from("inquilinos").select("rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi, factura_automatica").eq("id", inquilinoId).maybeSingle();
  if (error || !data) return null;
  return (
    <section aria-label="Datos fiscales" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Datos fiscales (para su factura)</h2>
      <FormFiscalInquilino
        inquilinoId={inquilinoId}
        datos={{ rfc: data.rfc ?? "", razon_social: data.razon_social ?? "", regimen_fiscal: data.regimen_fiscal ?? "", cp_fiscal: data.cp_fiscal ?? "", uso_cfdi: data.uso_cfdi ?? "", factura_automatica: !!data.factura_automatica }}
      />
    </section>
  );
}
