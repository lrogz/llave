import { NextResponse, type NextRequest } from "next/server";
import { connection } from "next/server";
import { correrAvisos } from "@/lib/avisos";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron lo llama cada mañana (ver vercel.json) con "Authorization: Bearer CRON_SECRET".
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  await connection();
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const r = await correrAvisos(createAdminClient(), { base: process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin });
  return NextResponse.json(r);
}
