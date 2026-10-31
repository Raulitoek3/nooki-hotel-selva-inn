// Edge Function "usuarios" · Nooki Hotel
// Maneja las cuentas que entran al sistema. Solo la usa el rol "admin".
//
// POST { accion: "listar" }
// POST { accion: "crear",   correo, nombre, rol, clave }
// POST { accion: "cambiar", id, nombre?, rol?, activo? }
// POST { accion: "clave",   id, clave }
//
// La llave service_role la pone Supabase sola en el entorno de la función:
// nunca se escribe en el código ni llega al navegador.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ROLES = ["admin", "recepcion", "dueno"] as const;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}
function error(mensaje: string, estado = 400, campo?: string) {
  return respuesta({ error: { mensaje, campo } }, estado);
}

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return error("Usa POST.", 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // ¿Quién llama? Debe ser un administrador activo.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion } = await sb.auth.getUser(jwt);
  const yo = sesion?.user;
  if (!yo) return error("Inicia sesión otra vez.", 401);

  const { data: perfil } = await sb.from("usuarios").select("rol, activo").eq("id", yo.id).maybeSingle();
  if (!perfil || !perfil.activo || perfil.rol !== "admin") {
    return error("Solo el administrador puede manejar usuarios.", 403);
  }

  const auditar = (accion: string, detalle: string, registro_id?: string) =>
    sb.from("auditoria").insert({
      modulo: "Usuarios", tipo: "cambio", accion, detalle,
      usuario_id: yo.id, registro_id: registro_id ?? null,
    });

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { /* cuerpo vacío */ }
  const accion = String(cuerpo.accion ?? "");

  // ---------- listar ----------
  if (accion === "listar") {
    const { data: filas, error: e1 } = await sb.from("usuarios")
      .select("id, nombre, correo, rol, activo, creado_en").order("creado_en");
    if (e1) return error("No se pudo leer la lista de usuarios.", 500);
    const { data: auth } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const ultimo = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at]));
    return respuesta({ usuarios: filas.map((f) => ({ ...f, ultimo_ingreso: ultimo.get(f.id) ?? null })) });
  }

  // ---------- crear ----------
  if (accion === "crear") {
    const correo = String(cuerpo.correo ?? "").trim().toLowerCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    const rol = String(cuerpo.rol ?? "");
    const clave = String(cuerpo.clave ?? "");
    if (!nombre) return error("Escribe el nombre.", 400, "nombre");
    if (!correoValido(correo)) return error("El correo no es válido.", 400, "correo");
    if (!ROLES.includes(rol as typeof ROLES[number])) return error("Elige un rol.", 400, "rol");
    if (clave.length < 8) return error("La contraseña debe tener al menos 8 caracteres.", 400, "clave");

    const { data: nuevo, error: e1 } = await sb.auth.admin.createUser({
      email: correo, password: clave, email_confirm: true, user_metadata: { nombre },
    });
    if (e1 || !nuevo?.user) {
      const repetido = /already|registered|exists/i.test(e1?.message ?? "");
      return error(repetido ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta.", 400, "correo");
    }
    const { error: e2 } = await sb.from("usuarios")
      .upsert({ id: nuevo.user.id, nombre, rol, correo, activo: true });
    if (e2) {
      await sb.auth.admin.deleteUser(nuevo.user.id);
      return error("No se pudo registrar el usuario.", 500);
    }
    await auditar("creó", `Usuario ${correo} (${rol})`, nuevo.user.id);
    return respuesta({ ok: true, id: nuevo.user.id }, 201);
  }

  // ---------- cambiar nombre, rol o activo ----------
  if (accion === "cambiar") {
    const id = String(cuerpo.id ?? "");
    const { data: actual } = await sb.from("usuarios").select("*").eq("id", id).maybeSingle();
    if (!actual) return error("No existe ese usuario.", 404);

    const cambios: Record<string, unknown> = {};
    if (typeof cuerpo.nombre === "string" && cuerpo.nombre.trim()) cambios.nombre = cuerpo.nombre.trim();
    if (typeof cuerpo.rol === "string") {
      if (!ROLES.includes(cuerpo.rol as typeof ROLES[number])) return error("Rol no válido.", 400, "rol");
      cambios.rol = cuerpo.rol;
    }
    if (typeof cuerpo.activo === "boolean") cambios.activo = cuerpo.activo;
    if (!Object.keys(cambios).length) return error("No hay cambios.");

    // No dejar el sistema sin administrador
    const dejaDeSerAdmin = actual.rol === "admin" && actual.activo &&
      ((cambios.rol && cambios.rol !== "admin") || cambios.activo === false);
    if (dejaDeSerAdmin) {
      if (id === yo.id) return error("No puedes quitarte el rol de administrador a ti mismo.");
      const { count } = await sb.from("usuarios").select("id", { count: "exact", head: true })
        .eq("rol", "admin").eq("activo", true);
      if ((count ?? 0) <= 1) return error("Debe quedar al menos un administrador activo.");
    }

    const { error: e1 } = await sb.from("usuarios").update(cambios).eq("id", id);
    if (e1) return error("No se pudo guardar.", 500);

    // Una cuenta desactivada no puede iniciar sesión
    if (typeof cambios.activo === "boolean") {
      await sb.auth.admin.updateUserById(id, { ban_duration: cambios.activo ? "none" : "876000h" });
    }
    await auditar("modificó", `Usuario ${actual.correo ?? id}: ${JSON.stringify(cambios)}`, id);
    return respuesta({ ok: true });
  }

  // ---------- poner contraseña nueva ----------
  if (accion === "clave") {
    const id = String(cuerpo.id ?? "");
    const clave = String(cuerpo.clave ?? "");
    if (clave.length < 8) return error("La contraseña debe tener al menos 8 caracteres.", 400, "clave");
    const { data: actual } = await sb.from("usuarios").select("correo").eq("id", id).maybeSingle();
    if (!actual) return error("No existe ese usuario.", 404);
    const { error: e1 } = await sb.auth.admin.updateUserById(id, { password: clave });
    if (e1) return error("No se pudo cambiar la contraseña.", 500);
    await auditar("modificó", `Contraseña nueva para ${actual.correo ?? id}`, id);
    return respuesta({ ok: true });
  }

  return error("Acción no válida.");
});
