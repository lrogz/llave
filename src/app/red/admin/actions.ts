"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esPlataforma } from "@/lib/red";

// Solo las administradoras de la plataforma (PLATAFORMA_ADMINS) aprueban o rechazan solicitudes.
export async function decidirSolicitud(f: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!esPlataforma(user?.email)) throw new Error("Sin permiso.");
  const id = String(f.get("proveedor_id") ?? "");
  const decision = String(f.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["aprobar", "rechazar", "pausar"].includes(decision)) return;
  const cambios =
    decision === "aprobar" ? { es_red: true, verificado: true, estado_red: "aprobado" } : decision === "pausar" ? { es_red: false, estado_red: "solicitud" } : { es_red: false, verificado: false, estado_red: "rechazado" };
  await createAdminClient().from("proveedores").update(cambios).eq("id", id).not("estado_red", "is", null);
  revalidatePath("/red/admin");
}
