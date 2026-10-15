import type { SupabaseClient } from "@supabase/supabase-js";
import { RenovarForm } from "@/app/contratos/RenovarForm";
import { guardarAjuste } from "@/app/contratos/actions";
import { calcularAumento, mesINPC, pctTexto, type Ajuste } from "@/lib/aumento";
import { formatoFecha, pesos } from "@/lib/datos";
import { Boton } from "./Boton";

const campo = "min-h-11 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";
const masDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const masUnAno = (fecha: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(m === 2 && d === 29 ? 28 : d).padStart(2, "0")}`;
};

type Extra = Ajuste & { renta_programada: number | null; renta_desde: string | null };
type Aumento = { id: string; renta_anterior: number; renta_nueva: number; pct: number; metodo: string; desde: string; token: string; avisado_at: string | null; visto_at: string | null };

// Renovación con aumento por INPC (o % fijo) y la forma en que sube la renta de este contrato.
export async function Renovacion({ db, contrato }: { db: SupabaseClient; contrato: { id: string; fin: string; renta: number } }) {
  const [{ data: x }, { data: aus }] = await Promise.all([
    db.from("contratos").select("ajuste_tipo, ajuste_pct, ajuste_tope, renta_programada, renta_desde").eq("id", contrato.id).maybeSingle(),
    db.from("aumentos_renta").select("id, renta_anterior, renta_nueva, pct, metodo, desde, token, avisado_at, visto_at").eq("contrato_id", contrato.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const extra = x as Extra | null;
  const ajuste: Ajuste = { ajuste_tipo: extra?.ajuste_tipo ?? "inpc", ajuste_pct: Number(extra?.ajuste_pct ?? 0), ajuste_tope: extra?.ajuste_tope != null ? Number(extra.ajuste_tope) : null };
  const desde = masDias(contrato.fin, 1);
  const calc = extra ? await calcularAumento(db, Number(contrato.renta), ajuste, desde) : null;
  const aumentos = (aus ?? []) as Aumento[];

  const detalle = !calc ? null : calc.metodo === "inpc" && !calc.falta ? (
    <div className="flex flex-col gap-1 rounded-xl bg-fondo p-3 text-xs">
      <span className="font-semibold text-tinta">
        Aumento por inflación: {pctTexto(calc.pct)} → {pesos.format(calc.rentaNueva)}
      </span>
      <span className="text-gris">
        INPC {mesINPC(calc.periodoFinal!)}: {calc.inpcFinal!.toFixed(3)} / INPC {mesINPC(calc.periodoInicial!)}: {calc.inpcInicial!.toFixed(3)} = {pctTexto(calc.inflacion!)}
        {ajuste.ajuste_pct ? ` + ${pctTexto(ajuste.ajuste_pct)} pactado` : ""}
        {calc.topado ? ` (tope ${pctTexto(ajuste.ajuste_tope!)})` : ""}
      </span>
      {calc.fuente !== "inegi" && <span className="text-naranja-oscuro">Valores de referencia: verifícalos en inegi.org.mx o conecta la API del INEGI.</span>}
    </div>
  ) : calc.metodo === "fijo" ? (
    <p className="rounded-xl bg-fondo p-3 text-xs font-semibold">
      Aumento pactado de {pctTexto(calc.pct)} → {pesos.format(calc.rentaNueva)}
    </p>
  ) : calc.falta ? (
    <p className="rounded-xl bg-naranja-claro p-3 text-xs text-naranja-oscuro">{calc.falta} Escribe la renta nueva a mano.</p>
  ) : null;

  return (
    <>
      {extra?.renta_programada && extra.renta_desde && (
        <p className="rounded-xl bg-verde-claro p-3 text-xs text-verde-oscuro">
          Renta nueva de <strong>{pesos.format(extra.renta_programada)}</strong> a partir del {formatoFecha(extra.renta_desde)}.
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-semibold text-verde">Renovar</summary>
        <RenovarForm id={contrato.id} fin={masUnAno(contrato.fin)} desde={desde} renta={Number(contrato.renta)} sugerida={calc?.rentaNueva ?? Number(contrato.renta)} detalle={detalle} />
      </details>
      <details>
        <summary className="cursor-pointer font-semibold text-verde">Cómo sube la renta</summary>
        <form action={guardarAjuste} className="mt-2 grid grid-cols-2 gap-2">
          <input type="hidden" name="id" value={contrato.id} />
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-gris">
            Al renovar
            <select name="ajuste_tipo" defaultValue={ajuste.ajuste_tipo} className={`${campo} text-tinta`}>
              <option value="inpc">Según inflación (INPC del INEGI)</option>
              <option value="fijo">Un % fijo pactado</option>
              <option value="ninguno">Sin aumento automático</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
            % fijo o puntos extra
            <input name="ajuste_pct" inputMode="decimal" defaultValue={ajuste.ajuste_pct || ""} placeholder="0" className={`${campo} text-tinta`} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
            Tope máximo % (opcional)
            <input name="ajuste_tope" inputMode="decimal" defaultValue={ajuste.ajuste_tope ?? ""} placeholder="Sin tope" className={`${campo} text-tinta`} />
          </label>
          <p className="col-span-2 text-xs text-gris">Revisa lo que dice el contrato. En algunos estados (p. ej. CDMX) el aumento a vivienda no puede pasar de la inflación del año anterior.</p>
          <Boton estilo="claro" className="col-span-2 justify-self-start" enviando="Guardando…">
            Guardar
          </Boton>
        </form>
      </details>
      {aumentos.length > 0 && (
        <ul aria-label="Aumentos" className="flex flex-col gap-1 text-xs">
          {aumentos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatoFecha(a.desde)}: {pesos.format(a.renta_anterior)} → <strong>{pesos.format(a.renta_nueva)}</strong> ({Number(a.pct) >= 0 ? "+" : ""}
                {pctTexto(Number(a.pct))}
                {a.metodo === "inpc" ? " INPC" : ""}) {a.visto_at ? "· ✓ visto" : a.avisado_at ? "· avisado" : ""}
              </span>
              <a href={`/n/${a.token}`} target="_blank" rel="noreferrer" className="font-semibold text-verde hover:underline">
                Aviso
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
