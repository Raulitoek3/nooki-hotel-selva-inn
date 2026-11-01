// Edge Function "nooki-aviso" · Hotel Selva Inn
// Recibe los avisos (webhooks) de Nooki cuando SUNAT responde. Sin sesión (verify_jwt = false):
// se valida la firma "Nooki-Firma: t=<unix>,v1=<hex>" con HMAC-SHA256(NOOKI_WHSEC, t + "." + cuerpo).
// Cada aviso se guarda por su "Nooki-Entrega" para no procesarlo dos veces.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const WHSEC = Deno.env.get("NOOKI_WHSEC") ?? "";
const NOOKI_URL = (Deno.env.get("NOOKI_URL") ?? "https://api.nooki.pe").replace(/\/$/, "");
const ESTADOS = ["pendiente", "enviando", "aceptado", "observado", "rechazado", "error", "por_verificar", "anulado"];

async function hmacHex(clave: string, texto: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
  return [...new Uint8Array(f)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Usa POST", { status: 405 });
  if (!WHSEC) return new Response("Falta NOOKI_WHSEC", { status: 503 });
  const crudo = await req.text();
  const firma = req.headers.get("Nooki-Firma") ?? "";
  const partes = Object.fromEntries(firma.split(",").map((p) => p.trim().split("=", 2)));
  const t = Number(partes.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return new Response("Firma vencida", { status: 400 });
  if (!partes.v1 || !iguales(await hmacHex(WHSEC, `${partes.t}.${crudo}`), String(partes.v1))) return new Response("Firma inválida", { status: 401 });

  let cuerpo: any;
  try { cuerpo = JSON.parse(crudo); } catch { return new Response("JSON inválido", { status: 400 }); }
  const entrega = req.headers.get("Nooki-Entrega") ?? cuerpo.id ?? crypto.randomUUID();

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ins = await sb.from("avisos_nooki").insert({ entrega_id: String(entrega), evento: String(cuerpo.evento ?? ""), cuerpo });
  if (ins.error) return new Response(JSON.stringify({ ok: true, repetido: true }), { status: 200 });   // ya procesado

  const c = cuerpo?.data?.comprobante;
  if (c?.id != null) {
    const cambios: Record<string, unknown> = {};
    if (ESTADOS.includes(c.estado)) cambios.estado = c.estado;
    if (c.hash) cambios.hash = c.hash;
    const sunat = c.sunat ?? {};
    if (sunat.codigo ?? c.codigo_sunat) cambios.codigo_sunat = String(sunat.codigo ?? c.codigo_sunat);
    if (sunat.mensaje ?? c.mensaje_sunat) cambios.mensaje_sunat = String(sunat.mensaje ?? c.mensaje_sunat).slice(0, 500);
    const pdf = c.enlaces?.pdf_publico;
    if (pdf) cambios.enlace_pdf = /^https?:/.test(pdf) ? pdf : NOOKI_URL + (pdf.startsWith("/") ? "" : "/") + pdf;
    if (Object.keys(cambios).length) await sb.from("comprobantes").update(cambios).eq("nooki_id", String(c.id));
  }
  await sb.from("avisos_nooki").update({ procesado: true }).eq("entrega_id", String(entrega));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
