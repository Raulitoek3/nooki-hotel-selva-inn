// Edge Function "facturar" · Hotel Selva Inn
// Habla con el facturador de Nooki (api.nooki.pe). Las llaves NUNCA llegan al navegador:
// son secretos de Supabase que pone Raúl: NOOKI_URL, NOOKI_KEY, NOOKI_SECRET.
//
// POST { accion: "emitir", pago_id, tipo: "boleta"|"factura"|"nota_venta", cliente: {tipo_doc, num_doc, nombre, direccion?} }
// POST { accion: "consultar", comprobante_id }      → actualiza el estado desde Nooki
// POST { accion: "reenviar",  comprobante_id }      → reintenta uno en error / sin conexión
// POST { accion: "anular",    comprobante_id, motivo }
// POST { accion: "nota_credito", comprobante_id, motivo, descripcion, monto?, ref? }  (pide clave abierta o admin)
//        motivo 01, 02, 06: por el total (Nooki copia los ítems). 04, 07, 09: por "monto" (un ítem con ese importe).
//        ref: código único de esa nota (permite varias notas parciales sobre el mismo comprobante sin duplicar).
// POST { accion: "probar" }                         → datos de la empresa en Nooki (ambiente, Amazonía, series)
// POST { accion: "configurar_aviso" }               → registra la URL de nooki-aviso en Nooki (solo admin)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const error = (mensaje: string, s = 400) => json({ error: { mensaje } }, s);

const NOOKI_URL = (Deno.env.get("NOOKI_URL") ?? "https://api.nooki.pe").replace(/\/$/, "");
const NOOKI_KEY = Deno.env.get("NOOKI_KEY") ?? "";
const NOOKI_SECRET = Deno.env.get("NOOKI_SECRET") ?? "";
const SIN_LLAVES = "Falta configurar la conexión con el facturador (llaves de Nooki en Supabase).";

type Resp = { ok: boolean; status: number; data: any };
async function nooki(metodo: string, ruta: string, cuerpo?: unknown, idem?: string): Promise<Resp> {
  if (!NOOKI_KEY || !NOOKI_SECRET) return { ok: false, status: 0, data: { error: { mensaje: SIN_LLAVES } } };
  const h: Record<string, string> = { "X-Api-Key": NOOKI_KEY, "X-Api-Secret": NOOKI_SECRET, "Accept": "application/json" };
  if (cuerpo !== undefined) h["Content-Type"] = "application/json";
  if (idem) h["Idempotency-Key"] = idem;
  try {
    const r = await fetch(NOOKI_URL + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    let data: any = null;
    try { data = await r.json(); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  } catch (_e) {
    return { ok: false, status: 0, data: { error: { mensaje: "No se pudo conectar con el facturador. Se puede reenviar después." } } };
  }
}

function fCorta(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
}
const ESTADOS = ["pendiente", "enviando", "aceptado", "observado", "rechazado", "error", "por_verificar", "anulado"];

// Pasa la respuesta de Nooki a las columnas del comprobante del hotel
function desdeNooki(d: any) {
  const c = d?.comprobante ?? d ?? {};
  const out: Record<string, unknown> = {};
  if (c.id != null) out.nooki_id = String(c.id);
  if (c.numero != null) {
    const n = String(c.numero).split("-").pop();
    if (n && /^\d+$/.test(n)) out.numero = Number(n);
  }
  if (ESTADOS.includes(c.estado)) out.estado = c.estado;
  if (c.hash) out.hash = c.hash;
  const sunat = c.sunat ?? {};
  const codigo = sunat.codigo ?? c.codigo_sunat ?? c.cdr_codigo;
  const mensaje = sunat.mensaje ?? c.mensaje_sunat ?? c.cdr_mensaje ?? c.observaciones;
  if (codigo != null) out.codigo_sunat = String(codigo);
  if (mensaje) out.mensaje_sunat = String(typeof mensaje === "string" ? mensaje : JSON.stringify(mensaje)).slice(0, 500);
  const pdf = c.enlaces?.pdf_publico;
  if (pdf) out.enlace_pdf = /^https?:/.test(pdf) ? pdf : NOOKI_URL + (pdf.startsWith("/") ? "" : "/") + pdf;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return error("Usa POST.", 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: s } = await sb.auth.getUser(jwt);
  const yo = s?.user;
  if (!yo) return error("Inicia sesión otra vez.", 401);
  const { data: perfil } = await sb.from("usuarios").select("rol, activo").eq("id", yo.id).maybeSingle();
  if (!perfil?.activo || !["admin", "recepcion"].includes(perfil.rol)) return error("Tu cuenta no puede emitir comprobantes.", 403);

  let b: any = {};
  try { b = await req.json(); } catch { /* vacío */ }

  const auditar = (accion: string, detalle: string, id?: number, tipo = "sunat") =>
    sb.from("auditoria").insert({ modulo: "Ventas", tipo, accion, detalle, usuario_id: yo.id, tabla: "comprobantes", registro_id: id ? String(id) : null });
  const guardar = async (id: number, cambios: Record<string, unknown>) => {
    const { data } = await sb.from("comprobantes").update(cambios).eq("id", id).select().single();
    return data;
  };

  async function claveAbierta() {
    if (perfil!.rol === "admin") return true;
    const { data: ses } = await sb.from("sesiones_admin").select("hasta").eq("usuario_id", yo!.id).maybeSingle();
    return !!ses && new Date(ses.hasta) > new Date();
  }

  // Envía a Nooki un comprobante ya guardado (boleta, factura o nota de crédito)
  async function enviar(c: any) {
    if (c.tipo === "nota_credito") {
      const { data: af } = await sb.from("comprobantes").select("nooki_id, numero_completo").eq("id", c.afectado_id).maybeSingle();
      const parcial = !["01", "02", "06"].includes(String(c.motivo_nota));
      const r = await nooki("POST", "/v1/notas-credito", { serie: c.serie, comprobante_afectado_id: af?.nooki_id, comprobante_afectado: af?.numero_completo,
        motivo: c.motivo_nota, descripcion_motivo: c.descripcion_motivo, ...(parcial ? { items: c.items } : {}) }, c.idempotency_key);
      if (r.ok) return await guardar(c.id, desdeNooki(r.data));
      return await guardar(c.id, { estado: "error", mensaje_sunat: String(r.data?.error?.mensaje ?? `El facturador respondió ${r.status}.`).slice(0, 500) });
    }
    const ruta = c.tipo === "factura" ? "/v1/facturas" : "/v1/boletas";
    const cliente = c.cliente_tipo_doc && c.cliente_tipo_doc !== "0"
      ? { tipo_doc: c.cliente_tipo_doc, num_doc: c.cliente_num_doc, razon_social: c.cliente_nombre, ...(c.cliente_direccion ? { direccion: c.cliente_direccion } : {}) }
      : undefined;
    const r = await nooki("POST", ruta, { serie: c.serie, ...(cliente ? { cliente } : {}), items: c.items }, c.idempotency_key);
    if (r.ok) return await guardar(c.id, { ...desdeNooki(r.data), mensaje_sunat: desdeNooki(r.data).mensaje_sunat ?? null });
    const m = r.data?.error?.mensaje ?? `El facturador respondió ${r.status}.`;
    return await guardar(c.id, { estado: "error", mensaje_sunat: String(m).slice(0, 500) });
  }

  // ---------------- emitir ----------------
  if (b.accion === "emitir") {
    const tipo = String(b.tipo ?? "");
    if (!["boleta", "factura", "nota_venta"].includes(tipo)) return error("Elige boleta, factura o nota de venta.");
    const { data: pago } = await sb.from("pagos").select("*").eq("id", Number(b.pago_id)).maybeSingle();
    if (!pago) return error("No existe ese pago.", 404);
    if (pago.anulado) return error("Ese pago está anulado.");
    if (pago.comprobante_id) {
      const { data: ya } = await sb.from("comprobantes").select("*").eq("id", pago.comprobante_id).single();
      return json({ comprobante: ya, repetido: true });
    }
    const [{ data: cfg }, { data: serie }] = await Promise.all([
      sb.from("config").select("amazonia").eq("id", 1).maybeSingle(),
      sb.from("series").select("serie").eq("tipo", tipo).eq("activa", true).order("serie").limit(1).maybeSingle(),
    ]);
    if (!serie) return error("No hay una serie activa para " + tipo + ".");
    const exo = (it: Record<string, unknown>) => (cfg?.amazonia && tipo !== "nota_venta" ? { ...it, tip_afe_igv: "20" } : it);   // Ley de la Amazonía
    let items: Record<string, unknown>[] = [];
    let r: any = null;
    if (pago.reserva_id) {
      ({ data: r } = await sb.from("reservas").select("*").eq("id", pago.reserva_id).maybeSingle());
      if (!r) return error("No existe la reserva del pago.");
      const { data: hab } = await sb.from("habitaciones").select("numero, tipo").eq("numero", r.habitacion).maybeSingle();
      const { data: th } = await sb.from("tipos_habitacion").select("nombre").eq("codigo", hab?.tipo ?? "").maybeSingle();
      const desc = `Hospedaje Hab. ${r.habitacion}${th?.nombre ? " " + th.nombre : ""} · ${fCorta(r.entrada)} al ${fCorta(r.salida)}${pago.tipo === "adelanto" ? " (adelanto)" : ""}`;
      items = [exo({ descripcion: desc, unidad: "ZZ", cantidad: 1, precio_unitario: Number(pago.monto) })];
    } else if (pago.pedido_id) {
      const { data: its } = await sb.from("pedido_items").select("*").eq("pedido_id", pago.pedido_id);
      const ids = (its ?? []).map((i: any) => i.producto_id).filter(Boolean);
      const { data: prods } = ids.length ? await sb.from("productos").select("id, unidad").in("id", ids) : { data: [] };
      const unidad = new Map((prods ?? []).map((p: any) => [p.id, p.unidad]));
      items = (its ?? []).map((i: any) => exo({ descripcion: i.descripcion, unidad: unidad.get(i.producto_id) ?? "NIU", cantidad: Number(i.cantidad), precio_unitario: Number(i.precio) }));
      if (!items.length) return error("El pedido no tiene productos.");
    } else return error("El pago no es de una reserva ni de un pedido.");

    const cli = b.cliente ?? {};
    if (tipo === "factura" && !/^(10|15|16|17|20)\d{9}$/.test(String(cli.num_doc ?? ""))) return error("La factura necesita un RUC válido.");
    if (tipo === "boleta" && Number(pago.monto) > 700 && (!cli.num_doc || cli.tipo_doc === "0")) return error("Una boleta de más de S/ 700 necesita el documento del cliente.");


    const idem = `hotel:pago:${pago.id}`;
    let { data: c } = await sb.from("comprobantes").select("*").eq("idempotency_key", idem).maybeSingle();
    if (!c) {
      const ins = await sb.from("comprobantes").insert({
        tipo, serie: serie.serie, cliente_tipo_doc: cli.tipo_doc ?? "0", cliente_num_doc: cli.num_doc ?? null,
        cliente_nombre: cli.nombre ?? "Clientes varios", cliente_direccion: cli.direccion ?? null,
        items, total: Number(pago.monto), estado: tipo === "nota_venta" ? "interno" : "pendiente",
        idempotency_key: idem, reserva_id: r?.id ?? null, pedido_id: pago.pedido_id ?? null, creado_por: yo.id,
      }).select().single();
      if (ins.error) return error("No se pudo guardar el comprobante.", 500);
      c = ins.data;
    }
    await sb.from("pagos").update({ comprobante_id: c.id }).eq("id", pago.id);

    if (tipo === "nota_venta") {
      if (c.numero == null) {
        // Número correlativo de la serie interna (NV01), sin repetir aunque dos cobren a la vez
        const { data: n, error: e } = await sb.rpc("siguiente_numero_interno", { p_serie: serie.serie });
        if (e) return error("No se pudo numerar la nota de venta.", 500);
        c = await guardar(c.id, { numero: n, estado: "interno" });
      }
      return json({ comprobante: c });
    }
    c = await enviar(c);
    await auditar("emitió", `${c.tipo} ${c.numero_completo ?? c.serie} · ${c.estado}${c.mensaje_sunat ? " · " + c.mensaje_sunat : ""}`, c.id);
    return json({ comprobante: c });
  }

  // ---------------- acciones sobre un comprobante ----------------
  if (["consultar", "reenviar", "anular", "nota_credito"].includes(b.accion)) {
    const { data: c } = await sb.from("comprobantes").select("*").eq("id", Number(b.comprobante_id)).maybeSingle();
    if (!c) return error("No existe ese comprobante.", 404);
    if (c.tipo === "nota_venta") return error("Las notas de venta son internas: no van a SUNAT.");

    if (b.accion === "consultar") {
      if (!c.nooki_id) return json({ comprobante: c });
      const r = await nooki("GET", `/v1/comprobantes/${c.nooki_id}`);
      if (!r.ok) return error(r.data?.error?.mensaje ?? "No se pudo consultar.");
      return json({ comprobante: await guardar(c.id, desdeNooki(r.data)) });
    }
    if (b.accion === "reenviar") {
      if (!["error", "sin_internet", "por_verificar"].includes(c.estado)) return error("Solo se reenvían comprobantes con error o sin conexión.");
      let nuevo;
      if (c.nooki_id) {
        const r = await nooki("POST", `/v1/comprobantes/${c.nooki_id}/reenviar`, {});
        nuevo = r.ok ? await guardar(c.id, desdeNooki(r.data)) : await guardar(c.id, { mensaje_sunat: r.data?.error?.mensaje ?? "No se pudo reenviar." });
      } else nuevo = await enviar(c);
      await auditar("reenvió", `${nuevo.numero_completo ?? nuevo.serie} · ${nuevo.estado}`, c.id);
      return json({ comprobante: nuevo });
    }
    // anular y nota de crédito: piden la clave de administrador abierta (o ser admin)
    if (!(await claveAbierta())) return error("Esto pide la clave de administrador.", 403);
    if (b.accion === "nota_credito") {
      if (!["aceptado", "observado"].includes(c.estado) || !["boleta", "factura"].includes(c.tipo)) return error("Solo se hace nota de crédito de boletas o facturas aceptadas.");
      const motivo = String(b.motivo ?? "");
      if (!["01", "02", "04", "06", "07", "09"].includes(motivo)) return error("Elige el motivo de la nota de crédito.");
      const parcial = !["01", "02", "06"].includes(motivo);
      const { data: previas } = await sb.from("comprobantes").select("id, total, estado, idempotency_key").eq("afectado_id", c.id).eq("tipo", "nota_credito");
      const idem = b.ref ? `hotel:nc:${c.id}:${String(b.ref).replace(/[^\w-]/g, "").slice(0, 40)}` : `hotel:nc:${c.id}`;
      const vigentes = (previas ?? []).filter((x: any) => !["anulado", "rechazado"].includes(x.estado) && x.idempotency_key !== idem);
      const usado = vigentes.reduce((s: number, x: any) => s + Number(x.total), 0);
      const saldo = Math.round((Number(c.total) - usado) * 100) / 100;
      const monto = parcial ? Math.round(Number(b.monto) * 100) / 100 : saldo;
      if (!parcial && vigentes.length) return error("Ya tiene una nota de crédito: usa un motivo por monto (07 o 09).");
      if (!(monto > 0)) return error("Escribe un monto mayor a cero.");
      if (monto > saldo + 0.001) return error(`El monto supera lo que queda por acreditar (S/ ${saldo.toFixed(2)}).`);
      let itemsNc = c.items;
      if (parcial) {
        const { data: cfg } = await sb.from("config").select("amazonia").eq("id", 1).maybeSingle();
        const it: Record<string, unknown> = { descripcion: String(b.descripcion ?? "").slice(0, 200) || "Ajuste sobre " + c.numero_completo, unidad: "ZZ", cantidad: 1, precio_unitario: monto };
        itemsNc = [cfg?.amazonia ? { ...it, tip_afe_igv: "20" } : it];
      }
      const tipoSerie = c.tipo === "factura" ? "nota_credito_factura" : "nota_credito_boleta";
      const { data: sNc } = await sb.from("series").select("serie").eq("tipo", tipoSerie).eq("activa", true).limit(1).maybeSingle();
      if (!sNc) return error("No hay serie activa para notas de crédito.");
      let { data: nc } = await sb.from("comprobantes").select("*").eq("idempotency_key", idem).maybeSingle();
      if (!nc) {
        const ins = await sb.from("comprobantes").insert({
          tipo: "nota_credito", serie: sNc.serie, cliente_tipo_doc: c.cliente_tipo_doc, cliente_num_doc: c.cliente_num_doc, cliente_nombre: c.cliente_nombre,
          cliente_direccion: c.cliente_direccion, items: itemsNc, total: monto, estado: "pendiente", afectado_id: c.id, motivo_nota: motivo,
          descripcion_motivo: String(b.descripcion ?? "").slice(0, 250) || "Anulación de la operación", reserva_id: c.reserva_id, pedido_id: c.pedido_id,
          idempotency_key: idem, creado_por: yo.id,
        }).select().single();
        if (ins.error) return error("No se pudo guardar la nota de crédito.", 500);
        nc = ins.data;
      }
      nc = await enviar(nc);
      await auditar("emitió nota de crédito", `${nc.numero_completo ?? nc.serie} sobre ${c.numero_completo} · ${nc.estado}`, nc.id, "con_clave");
      return json({ comprobante: nc });
    }
    if (!["aceptado", "observado"].includes(c.estado)) return error("Solo se anulan comprobantes aceptados por SUNAT.");
    const { data: ncs } = await sb.from("comprobantes").select("id").eq("afectado_id", c.id).not("estado", "in", "(anulado,rechazado,error)").limit(1);
    if (ncs?.length) return error("Tiene una nota de crédito vigente: anúlala primero.");
    if (!b.motivo) return error("Escribe el motivo.");
    const r = await nooki("POST", `/v1/comprobantes/${c.nooki_id}/anular`, { motivo: String(b.motivo) });
    if (!r.ok) return error(r.data?.error?.mensaje ?? "No se pudo anular.");
    const nuevo = await guardar(c.id, { ...desdeNooki(r.data), mensaje_sunat: "Anulación: " + String(b.motivo).slice(0, 200) });
    await auditar("anuló", `${c.numero_completo} · ${b.motivo}`, c.id, "con_clave");
    return json({ comprobante: nuevo });
  }

  if (b.accion === "probar") {
    const r = await nooki("GET", "/v1/empresa");
    if (!r.ok) return error(r.data?.error?.mensaje ?? `El facturador respondió ${r.status}.`);
    const s2 = await nooki("GET", "/v1/series");
    return json({ empresa: r.data, series: s2.ok ? s2.data : null });
  }
  if (b.accion === "configurar_aviso") {
    if (perfil.rol !== "admin") return error("Solo el administrador.", 403);
    const url = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "") + "/functions/v1/nooki-aviso";
    const r = await nooki("PUT", "/v1/webhook", { url });
    if (!r.ok) return error(r.data?.error?.mensaje ?? "No se pudo configurar el aviso.");
    return json({ ok: true, url });
  }
  return error("Acción no válida.");
});
