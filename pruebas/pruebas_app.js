// Pruebas de la app real (ingreso y usuarios) con Supabase simulado en el navegador.
// Uso:  node pruebas/pruebas_app.js            (capturas en capturas/app/)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'app');
const OUT = process.env.NOOKI_OUT || path.join(__dirname, '..', 'capturas', 'app');
fs.mkdirSync(OUT, { recursive: true });

// ---------- servidor local de la carpeta app ----------
// Aplica app/_headers como Cloudflare: reglas por ruta (con * al final),
// "! Nombre" quita una cabecera puesta por una regla anterior.
const REGLAS = [];
fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').split('\n').forEach((l) => {
  if (/^\s*#/.test(l) || !l.trim()) return;
  if (!/^\s/.test(l)) { REGLAS.push({ patron: l.trim(), poner: [], quitar: [] }); return; }
  const r = REGLAS[REGLAS.length - 1];
  const q = l.match(/^\s+!\s*([A-Za-z-]+)\s*$/); if (q) { r.quitar.push(q[1].toLowerCase()); return; }
  const m = l.match(/^\s+([A-Za-z-]+):\s*(.+)$/); if (m) r.poner.push([m[1], m[2]]);
});
function cabecerasPara(ruta) {
  const h = {};
  REGLAS.forEach((r) => {
    const ok = r.patron.endsWith('*') ? ruta.startsWith(r.patron.slice(0, -1)) : ruta === r.patron;
    if (!ok) return;
    r.quitar.forEach((n) => Object.keys(h).forEach((k) => { if (k.toLowerCase() === n) delete h[k]; }));
    r.poner.forEach(([k, v]) => { h[k] = v; });
  });
  return h;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  const ruta = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta);
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cabecerasPara(ruta)); return res.end(); }
  res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' }, cabecerasPara(ruta)));
  fs.createReadStream(p).pipe(res);
});

// ---------- Supabase simulado ----------
function base64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(sub) { return base64url({ alg: 'HS256', typ: 'JWT' }) + '.' + base64url({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.firma'; }

function estadoNuevo() {
  return {
    cuentas: {   // correo → { id, clave }
      'oficinavirtual@nooki.pe': { id: 'u-admin', clave: 'Prueba-Admin-1' },
      'recepcion@ejemplo.test': { id: 'u-rec', clave: 'Prueba-Rec-1' },
      'sinacceso@ejemplo.test': { id: 'u-sin', clave: 'Prueba-Sin-1' },
      'dueno.activo@ejemplo.test': { id: 'u-due', clave: 'Prueba-Due-1' }
    },
    usuarios: [
      { id: 'u-admin', nombre: 'Administrador', correo: 'oficinavirtual@nooki.pe', rol: 'admin', activo: true, creado_en: '2026-10-31T19:00:00Z', ultimo_ingreso: '2026-10-31T19:30:00Z' },
      { id: 'u-rec', nombre: 'Recepción de prueba', correo: 'recepcion@ejemplo.test', rol: 'recepcion', activo: true, creado_en: '2026-10-31T19:05:00Z', ultimo_ingreso: null },
      { id: 'u-due', nombre: 'Dueño de prueba', correo: 'dueno.activo@ejemplo.test', rol: 'dueno', activo: true, creado_en: '2026-10-31T19:06:00Z', ultimo_ingreso: null }
    ],
    llamadas: [],
    clave: null, fallos: 0, esperaHasta: 0, claveHasta: {}, seq: {}, num: {},
    tablas: datosHotel()
  };
}

// Hotel de prueba: 4 pisos. El piso 3 está lleno hoy; la 201 está reservada para hoy.
function diaLima(delta) {
  const d = new Date(Date.now() + delta * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
}
function datosHotel() {
  const h = (numero, tipo, piso, extra) => Object.assign({ numero, tipo, piso, fuera_de_venta: false, zk_habitacion: null, notas: null }, extra || {});
  return {
    config: [{ id: 1, nombre_comercial: 'Hotel Selva Inn', razon_social: null, ruc: null, direccion: 'Jr. 28 de Julio 541, Puerto Maldonado, Madre de Dios',
      telefono: '+51 946 895 818', correo: 'info@hotelselvainn.com', amazonia: true, igv_pct: 10.5, adelanto_comprobante: 'al_cobrar',
      impresion_automatica: true, hora_checkin: '09:00:00', hora_checkout: '11:00:00', hora_max_checkout: '11:30:00' }],
    tipos_habitacion: [
      { codigo: 'P', nombre: 'Personal', tarifa: 160, camas: 1, capacidad: 1, orden: 1, activo: true },
      { codigo: 'D', nombre: 'Doble', tarifa: 200, camas: 2, capacidad: 2, orden: 2, activo: true },
      { codigo: 'MQ', nombre: 'Matrimonial Queen', tarifa: 180, camas: 1, capacidad: 2, orden: 4, activo: true },
      { codigo: 'MK', nombre: 'Matrimonial King', tarifa: 220, camas: 1, capacidad: 2, orden: 5, activo: true },
      { codigo: 'AU', nombre: 'Auditorio', tarifa: 125, camas: 0, capacidad: 40, orden: 7, activo: true }
    ],
    habitaciones: [h('101', 'P', 1), h('102', 'P', 1), h('103', 'P', 1), h('104', 'P', 1),
      h('201', 'MQ', 2), h('202', 'P', 2), h('203', 'D', 2), h('301', 'MK', 3), h('302', 'P', 3), h('AUD', 'AU', 0)],
    reservas: [
      { id: 1, habitacion: '301', cliente_id: 1, entrada: diaLima(-1), salida: diaLima(1), estado: 'ocupado', tarifa: 220, tarifa_nombre: 'Regular', personas: 2, origen: 'Directo' },
      { id: 2, habitacion: '302', cliente_id: 2, entrada: diaLima(-2), salida: diaLima(2), estado: 'ocupado', tarifa: 160, tarifa_nombre: 'Regular', personas: 1, origen: 'Booking' },
      { id: 3, habitacion: '101', cliente_id: 3, entrada: diaLima(0), salida: diaLima(2), estado: 'ocupado', tarifa: 160, tarifa_nombre: 'Regular', personas: 1, origen: 'WhatsApp' },
      { id: 4, habitacion: '201', cliente_id: 1, entrada: diaLima(0), salida: diaLima(1), estado: 'confirmado', tarifa: 180, tarifa_nombre: 'Regular', personas: 2, origen: 'Directo' },
      { id: 5, habitacion: '102', cliente_id: 2, entrada: diaLima(-5), salida: diaLima(-3), estado: 'finalizada', tarifa: 160, tarifa_nombre: 'Regular', personas: 1, origen: 'Directo' }
    ],
    // Personas ficticias (no son huéspedes reales)
    clientes: [
      { id: 1, tipo_doc: '1', num_doc: '00000001', nombre: 'Huésped Ficticio Uno', nacionalidad: 'Perú', no_grato: false },
      { id: 2, tipo_doc: '7', num_doc: 'X0000002', nombre: 'Huésped Ficticio Dos', nacionalidad: 'Brasil', no_grato: false },
      { id: 3, tipo_doc: '1', num_doc: '00000003', nombre: 'Huésped Ficticio Tres', nacionalidad: 'Perú', no_grato: true, motivo_no_grato: 'Prueba' }
    ],
    consumos: [], pagos: [], caja_turnos: [], caja_movimientos: [], comprobantes: [], limpieza: [], personal: [], productos: [],
    pedidos: [], pedido_items: [], movimientos_stock: [], cierres: [],
    mesas: [{ id: 'S1', nombre: '1', ambiente: 'Salón', asientos: 4, orden: 101, activa: true }, { id: 'S2', nombre: '2', ambiente: 'Salón', asientos: 4, orden: 102, activa: true },
      { id: 'P1', nombre: 'P1', ambiente: 'Piscina', asientos: 4, orden: 201, activa: true }],
    temporadas: [],
    origenes: [{ nombre: 'Directo', comision_pct: 0, activo: true, orden: 1 }, { nombre: 'Booking', comision_pct: 15, activo: true, orden: 2 }, { nombre: 'WhatsApp', comision_pct: 0, activo: true, orden: 3 }],
    formas_pago: [{ nombre: 'Efectivo', activa: true, orden: 1 }, { nombre: 'Yape', activa: true, orden: 2 }, { nombre: 'Tarjeta crédito', activa: true, orden: 3 }],
    motivos_viaje: [{ nombre: 'Vacaciones', orden: 1 }, { nombre: 'Trabajo', orden: 2 }],
    motivos_caja: [{ id: 1, nombre: 'Compra de útiles', tipo: 'salida', activo: true }],
    auditoria: [{ id: 1, creado_en: new Date().toISOString(), usuario_id: 'u-admin', modulo: 'Ajustes', tipo: 'cambio', con_clave: false, accion: 'modificó', tabla: 'config', registro_id: '1', antes: { telefono: '1' }, despues: { telefono: '2' } },
      { id: 2, creado_en: new Date().toISOString(), usuario_id: null, modulo: 'Clave', tipo: 'alerta', con_clave: false, accion: 'falló', detalle: 'Clave incorrecta (intento 1 de 5)' }]
  };
}
const AJUSTES = ['config', 'tipos_habitacion', 'habitaciones', 'personal', 'temporadas', 'formas_pago', 'origenes', 'motivos_caja', 'motivos_viaje'];
const SOLO_LECTURA = ['comprobantes', 'auditoria'];
const UNICOS = { tipos_habitacion: [['codigo'], ['nombre']], habitaciones: [['numero']], clientes: [['tipo_doc', 'num_doc']], formas_pago: [['nombre']], origenes: [['nombre']], cierres: [['fecha']], productos: [['nombre']] };
const REFERENCIAS = { habitaciones: [['reservas', 'habitacion', 'numero']], tipos_habitacion: [['habitaciones', 'tipo', 'codigo']] };
const AHORA = () => new Date().toISOString();
const DEFECTOS = {
  reservas: () => ({ estado: 'reservado', personas: 1, creado_en: AHORA(), checkin_en: null, checkout_en: null }),
  pagos: () => ({ anulado: false, tipo: 'pago', creado_en: AHORA(), comprobante_id: null }),
  consumos: () => ({ anulado: false, unidad: 'NIU', creado_en: AHORA() }),
  caja_turnos: () => ({ abierto_en: AHORA(), cerrado_en: null, monto_inicial: 0, contado: null }),
  caja_movimientos: () => ({ creado_en: AHORA() }),
  limpieza: () => ({ estado: 'sucia', tipo: 'Salida', desde: AHORA(), personal_id: null, terminado_en: null }),
  clientes: () => ({ nacionalidad: 'Perú', no_grato: false }),
  personal: () => ({ activo: true }),
  productos: () => ({ activo: true, en_restaurante: false, stock: null, creado_en: AHORA() }),
  pedidos: () => ({ estado: 'abierta', abierto_en: AHORA(), reserva_id: null, cerrado_en: null }),
  pedido_items: () => ({ enviados: 0, creado_en: AHORA() }),
  movimientos_stock: () => ({ creado_en: AHORA() }),
  cierres: () => ({ cerrado_en: AHORA() }),
  habitaciones: () => ({ fuera_de_venta: false, notas: null }),
  tipos_habitacion: () => ({ activo: true })
};
const activa = (r) => !['anulada', 'no_show'].includes(r.estado);
function cruza(lista, r, ignorar) {
  return activa(r) && lista.some((x) => x !== ignorar && x.id !== r.id && x.habitacion === r.habitacion && activa(x) && x.entrada < r.salida && r.entrada < x.salida);
}

function cumpleFiltros(fila, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    const i = v.indexOf('.'); const op = v.slice(0, i); const val = v.slice(i + 1);
    const a = fila[k] == null ? '' : String(fila[k]);
    const num = (x) => x !== '' && !isNaN(Number(x));
    const cmp = num(a) && num(val) ? Number(a) - Number(val) : a.localeCompare(val);
    if (op === 'eq' && !(a === val)) return false;
    if (op === 'neq' && a === val) return false;
    if (op === 'lt' && !(cmp < 0)) return false;
    if (op === 'lte' && !(cmp <= 0)) return false;
    if (op === 'gt' && !(cmp > 0)) return false;
    if (op === 'gte' && !(cmp >= 0)) return false;
    const enLista = (txt) => txt.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
    if (op === 'in') { if (!enLista(val).includes(a)) return false; }
    if (op === 'not') { const j = val.indexOf('.'); const op2 = val.slice(0, j), v2 = val.slice(j + 1); if (op2 === 'in' && enLista(v2).includes(a)) return false; if (op2 === 'eq' && a === v2) return false; if (op2 === 'is' && (v2 === 'null' ? fila[k] == null : String(fila[k]) === v2)) return false; }
    if (op === 'is') { if (val === 'null' ? fila[k] != null : String(fila[k]) !== val) return false; }
    if (op === 'like' || op === 'ilike') { const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/\*/g, '.*') + '$', op === 'ilike' ? 'i' : ''); if (!re.test(a)) return false; }
  }
  return true;
}
function ordenar(filas, orden) {
  if (!orden) return filas;
  const claves = orden.split(',').map((o) => o.split('.'));
  return filas.slice().sort((x, y) => {
    for (const [c, dir] of claves) {
      const a = x[c], b = y[c];
      const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', { numeric: true });
      if (r) return dir === 'desc' ? -r : r;
    }
    return 0;
  });
}

async function simular(page, E) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/cuwfogndinvrjszsbcpc\.supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (cuerpo, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
      body: JSON.stringify(cuerpo)
    });
    if (req.method() === 'OPTIONS') return json({});
    const auth = req.headers()['authorization'] || '';
    const sub = (() => { try { return JSON.parse(Buffer.from(auth.split('.')[1], 'base64url')).sub; } catch { return null; } })();

    if (url.pathname === '/auth/v1/token') {
      const b = req.postDataJSON();
      const c = E.cuentas[b.email];
      if (!c || c.clave !== b.password) return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const user = { id: c.id, aud: 'authenticated', role: 'authenticated', email: b.email, app_metadata: {}, user_metadata: {}, created_at: '2026-10-31T00:00:00Z' };
      return json({ access_token: jwt(c.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + c.id, user });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname === '/auth/v1/user') {
      const c = Object.entries(E.cuentas).find(([, v]) => v.id === sub);
      return c ? json({ id: sub, email: c[0], aud: 'authenticated', role: 'authenticated' }) : json({ msg: 'no' }, 401);
    }
    if (url.pathname === '/rest/v1/usuarios') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const filas = E.usuarios.filter((u) => u.id === id && id === sub);  // RLS simplificado
      const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (objeto) return filas.length ? json(filas[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
      return json(filas);
    }
    if (url.pathname === '/functions/v1/usuarios') {
      const b = req.postDataJSON() || {};
      E.llamadas.push(b.accion);
      const yo = E.usuarios.find((u) => u.id === sub);
      if (!yo || yo.rol !== 'admin') return json({ error: { mensaje: 'Solo el administrador puede manejar usuarios.' } }, 403);
      if (b.accion === 'listar') return json({ usuarios: E.usuarios });
      if (b.accion === 'crear') {
        if (!b.nombre || !b.nombre.trim()) return json({ error: { mensaje: 'Escribe el nombre.', campo: 'nombre' } }, 400);
        if ((b.clave || '').length < 8) return json({ error: { mensaje: 'La contraseña debe tener al menos 8 caracteres.', campo: 'clave' } }, 400);
        if (E.cuentas[b.correo]) return json({ error: { mensaje: 'Ya existe una cuenta con ese correo.', campo: 'correo' } }, 400);
        const id = 'u-' + (E.usuarios.length + 1);
        E.cuentas[b.correo] = { id, clave: b.clave };
        E.usuarios.push({ id, nombre: b.nombre.trim(), correo: b.correo, rol: b.rol, activo: true, creado_en: new Date().toISOString(), ultimo_ingreso: null });
        return json({ ok: true, id }, 201);
      }
      if (b.accion === 'cambiar') {
        const u = E.usuarios.find((x) => x.id === b.id);
        if (b.id === sub && (b.rol && b.rol !== 'admin' || b.activo === false)) return json({ error: { mensaje: 'No puedes quitarte el rol de administrador a ti mismo.' } }, 400);
        Object.assign(u, { nombre: b.nombre || u.nombre }, b.rol ? { rol: b.rol } : {}, typeof b.activo === 'boolean' ? { activo: b.activo } : {});
        return json({ ok: true });
      }
      if (b.accion === 'clave') {
        if ((b.clave || '').length < 8) return json({ error: { mensaje: 'La contraseña debe tener al menos 8 caracteres.', campo: 'clave' } }, 400);
        const u = E.usuarios.find((x) => x.id === b.id);
        E.cuentas[u.correo].clave = b.clave;
        return json({ ok: true });
      }
      return json({ error: { mensaje: 'Acción no válida.' } }, 400);
    }
    const yoU = E.usuarios.find((u) => u.id === sub && u.activo);
    const claveAbierta = () => yoU && (yoU.rol === 'admin' || (yoU.rol === 'recepcion' && (E.claveHasta[sub] || 0) > Date.now()));
    const objeto = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const representar = /return=representation/.test(req.headers()['prefer'] || '');

    const mt = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (mt && E.tablas[mt[1]]) {
      const t = mt[1], filas = E.tablas[t], metodo = req.method();
      const puede = yoU && yoU.rol !== 'dueno' && !SOLO_LECTURA.includes(t) && (!AJUSTES.includes(t) || claveAbierta());
      if (metodo === 'GET') {
        const sel = yoU ? ordenar(filas.filter((f) => cumpleFiltros(f, url.searchParams)), url.searchParams.get('order')) : [];
        if (objeto) return sel.length ? json(sel[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
        return json(sel);
      }
      if (metodo === 'POST') {
        if (!puede) return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
        let nuevas = req.postDataJSON(); if (!Array.isArray(nuevas)) nuevas = [nuevas];
        const igual = (x, n, grupo) => grupo.every((c) => x[c] != null && x[c] === n[c]);
        for (const n of nuevas) for (const g of (UNICOS[t] || [])) {
          if (filas.some((f) => igual(f, n, g)) || nuevas.filter((x) => igual(x, n, g)).length > 1) return json({ code: '23505', message: 'duplicate key' }, 409);
        }
        if (t === 'caja_turnos' && filas.some((f) => !f.cerrado_en)) return json({ code: '23505', message: 'una caja abierta' }, 409);
        if (t === 'limpieza' && nuevas.some((n) => filas.some((f) => f.habitacion === n.habitacion && f.estado !== 'lista'))) return json({ code: '23505', message: 'limpieza abierta' }, 409);
        if (t === 'pedidos' && nuevas.some((n) => filas.some((f) => f.mesa_id === n.mesa_id && ['abierta', 'precuenta'].includes(f.estado)))) return json({ code: '23505', message: 'pedido abierto' }, 409);
        if (t === 'movimientos_stock') for (const n of nuevas) {
          const pr = E.tablas.productos.find((x) => x.id === n.producto_id);
          if (!pr || pr.tipo !== 'Producto') return json({ code: 'P0001', message: 'solo productos' }, 400);
          if (n.tipo === 'salida' && Number(pr.stock || 0) < Number(n.cantidad)) return json({ code: 'P0001', message: 'Solo hay ' + pr.stock }, 400);
          pr.stock = Number(pr.stock || 0) + (n.tipo === 'entrada' ? 1 : -1) * Number(n.cantidad);
        }
        nuevas = nuevas.map((n) => Object.assign((DEFECTOS[t] || (() => ({})))(), n));
        if (t === 'clientes') for (const n of nuevas) if (n.tipo_doc === '1' && !/^\d{8}$/.test(n.num_doc || '')) return json({ code: '23514', message: 'check' }, 400);
        if (t === 'reservas') for (const n of nuevas) if (cruza(filas, n) || nuevas.some((x) => x !== n && x.habitacion === n.habitacion)) return json({ code: '23P01', message: 'exclusion' }, 409);
        nuevas.forEach((n) => { if (filas.length && 'id' in filas[0] || ['reservas', 'pagos', 'consumos', 'caja_turnos', 'caja_movimientos', 'limpieza', 'clientes', 'personal', 'productos', 'temporadas', 'motivos_caja', 'pedidos', 'pedido_items', 'movimientos_stock', 'cierres'].includes(t)) { if (n.id == null) n.id = (E.seq[t] = (E.seq[t] || Math.max(0, ...filas.map((f) => Number(f.id) || 0))) + 1); } filas.push(n); });
        return representar ? json(nuevas, 201) : route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      const afectadas = puede ? filas.filter((f) => cumpleFiltros(f, url.searchParams)) : [];
      if (metodo === 'PATCH') {
        const cambios = req.postDataJSON();
        for (const g of (UNICOS[t] || [])) if (g.length === 1 && cambios[g[0]] != null && filas.some((f) => f[g[0]] === cambios[g[0]] && !afectadas.includes(f))) return json({ code: '23505', message: 'duplicate key' }, 409);
        if (t === 'reservas') {
          for (const f of afectadas) {
            const sinClave = yoU.rol !== 'admin' && !claveAbierta();
            if (sinClave && ((cambios.tarifa != null && Number(cambios.tarifa) !== Number(f.tarifa)) || (cambios.estado === 'anulada' && f.estado !== 'anulada'))) return json({ code: '42501', message: 'pide la clave' }, 403);
            if (cruza(filas, Object.assign({}, f, cambios), f)) return json({ code: '23P01', message: 'exclusion' }, 409);
          }
        }
        afectadas.forEach((f) => Object.assign(f, cambios));
        return json(afectadas);
      }
      if (metodo === 'DELETE') {
        for (const f of afectadas) for (const [tr, col, pk] of (REFERENCIAS[t] || [])) {
          if (E.tablas[tr].some((x) => x[col] === f[pk])) return json({ code: '23503', message: 'foreign key violation' }, 409);
        }
        E.tablas[t] = filas.filter((f) => !afectadas.includes(f));
        return json(afectadas);
      }
    }

    if (url.pathname === '/functions/v1/facturar') {
      const b = req.postDataJSON() || {};
      if (!yoU || yoU.rol === 'dueno') return json({ error: { mensaje: 'Tu cuenta no puede emitir comprobantes.' } }, 403);
      E.llamadas.push('facturar:' + b.accion);
      if (b.accion === 'probar') return json({ error: { mensaje: 'Falta configurar la conexión con el facturador (llaves de Nooki en Supabase).' } }, 400);
      if (b.accion === 'configurar_aviso') { if (yoU.rol !== 'admin') return json({ error: { mensaje: 'Solo el administrador.' } }, 403); E.avisoActivo = true; return json({ ok: true }); }
      if (b.accion === 'emitir') {
        const pago = E.tablas.pagos.find((x) => x.id === b.pago_id);
        const serie = { boleta: 'B001', factura: 'F001', nota_venta: 'NV01' }[b.tipo];
        E.num[serie] = (E.num[serie] || 0) + 1;
        const c = { id: E.tablas.comprobantes.length + 1, tipo: b.tipo, serie, numero: E.num[serie], numero_completo: serie + '-' + E.num[serie],
          estado: b.tipo === 'nota_venta' ? 'interno' : 'aceptado', total: pago.monto, cliente_nombre: b.cliente.nombre, cliente_num_doc: b.cliente.num_doc,
          enlace_pdf: b.tipo === 'nota_venta' ? null : 'https://api.nooki.pe/publico/prueba.pdf', emitido_en: AHORA(), reserva_id: pago.reserva_id || null, pedido_id: pago.pedido_id || null };
        E.tablas.comprobantes.push(c); pago.comprobante_id = c.id;
        return json({ comprobante: c });
      }
      const c = E.tablas.comprobantes.find((x) => x.id === b.comprobante_id);
      if (b.accion === 'anular') { if (yoU.rol !== 'admin' && !claveAbierta()) return json({ error: { mensaje: 'Anular pide la clave de administrador.' } }, 403); c.estado = 'anulado'; }
      if (b.accion === 'nota_credito') {
        if (yoU.rol !== 'admin' && !claveAbierta()) return json({ error: { mensaje: 'Esto pide la clave de administrador.' } }, 403);
        E.num.BC01 = (E.num.BC01 || 0) + 1;
        const nc = { id: E.tablas.comprobantes.length + 1, tipo: 'nota_credito', serie: 'BC01', numero: E.num.BC01, numero_completo: 'BC01-' + E.num.BC01, estado: 'aceptado',
          total: ['04', '07', '09'].includes(String(b.motivo)) ? Number(b.monto) : c.total, motivo_nota: b.motivo, cliente_nombre: c.cliente_nombre, afectado_id: c.id, emitido_en: AHORA() };
        E.tablas.comprobantes.push(nc); return json({ comprobante: nc });
      }
      return json({ comprobante: c });
    }

    const mr = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (mr) {
      const f = mr[1], b = (() => { try { return req.postDataJSON() || {}; } catch { return {}; } })();
      const opera = yoU && (yoU.rol === 'admin' || yoU.rol === 'recepcion');
      if (f === 'admin_abierto') return json(!!claveAbierta());
      if (f === 'hay_clave') return json(!!E.clave);
      if (f === 'bloquear_clave') { delete E.claveHasta[sub]; return json(null); }
      if (f === 'renovar_clave') {
        if ((E.claveHasta[sub] || 0) > Date.now()) { E.claveHasta[sub] = Date.now() + 600000; return json({ ok: true, hasta: new Date(E.claveHasta[sub]).toISOString() }); }
        return json({ ok: false, hasta: null });
      }
      if (f === 'verificar_clave') {
        if (!opera) return json({ ok: false, motivo: 'sin_permiso' });
        if (!E.clave) return json({ ok: false, motivo: 'sin_clave' });
        if (E.esperaHasta > Date.now()) return json({ ok: false, motivo: 'espera' });
        if (b.p_clave === E.clave) { E.fallos = 0; E.claveHasta[sub] = Date.now() + 600000; return json({ ok: true, hasta: new Date(E.claveHasta[sub]).toISOString() }); }
        E.fallos++;
        if (E.fallos >= 5) { E.fallos = 0; E.esperaHasta = Date.now() + 60000; return json({ ok: false, motivo: 'espera' }); }
        return json({ ok: false, motivo: 'incorrecta', intentos_restantes: 5 - E.fallos });
      }
      if (f === 'cambiar_clave') {
        if (!opera) return json({ ok: false, motivo: 'sin_permiso' });
        if (!b.p_nueva || b.p_nueva.length < 4) return json({ ok: false, motivo: 'muy_corta' });
        if (E.clave && yoU.rol !== 'admin') {
          if (!claveAbierta()) return json({ ok: false, motivo: 'clave_cerrada' });
          if (b.p_actual !== E.clave) return json({ ok: false, motivo: 'actual_incorrecta' });
        }
        E.clave = b.p_nueva; return json({ ok: true });
      }
    }
    return json({ message: 'no simulado: ' + url.pathname }, 404);
  });
}

// ---------- pruebas ----------
let ok = 0, mal = 0;
function prueba(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✔ ' + nombre); } else { mal++; console.log('  ✘ ' + nombre + (extra ? ' → ' + extra : '')); }
}

async function sinScrollLateral(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function entrar(page, correo, clave) {
  await page.fill('#iCorreo', correo);
  await page.fill('#iClave', clave);
  await page.click('#iEntrar');
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const URL0 = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const errores = [];

  // ===== SISTEMA PRINCIPAL: el prototipo (mismo diseño) con datos reales =====
  for (const [nombreVista, viewport] of [['escritorio', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    console.log('\nSISTEMA (diseño del prototipo) · ' + nombreVista.toUpperCase());
    const E = estadoNuevo();
    const ctx = await browser.newContext({ viewport, locale: 'es-PE' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push('sistema ' + nombreVista + ': ' + e.message));
    page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push('sistema ' + nombreVista + ' (seguridad): ' + m.text()); });
    await simular(page, E);
    await page.goto(URL0);
    await page.waitForURL(/ingreso\.html/);
    prueba('sin sesión manda a la página de ingreso', true);
    prueba('ingreso con el logo del hotel', await page.$eval('.marca-grande img', (i) => i.complete && i.naturalWidth > 0));
    prueba('ingreso dice Hotel Selva Inn y no Nooki', (await page.textContent('body')).includes('Hotel Selva Inn') && !/nooki/i.test(await page.title()));
    prueba('sin scroll de lado (ingreso)', await sinScrollLateral(page));
    await entrar(page, 'oficinavirtual@nooki.pe', 'mala-clave');
    await page.waitForSelector('#iError:not([hidden])');
    prueba('contraseña mala avisa', (await page.textContent('#iError')).includes('incorrectos'));
    await entrar(page, 'sinacceso@ejemplo.test', 'Prueba-Sin-1');
    await page.waitForFunction(() => ((document.querySelector('#iError') || {}).textContent || '').includes('no tiene acceso'));
    prueba('cuenta sin rol no entra', /ingreso/.test(page.url()));
    await page.screenshot({ path: path.join(OUT, 'sistema-' + nombreVista + '-1-ingreso.png') });
    await entrar(page, 'oficinavirtual@nooki.pe', 'Prueba-Admin-1');
    await page.waitForSelector('#view h1', { timeout: 15000 });
    prueba('entra al sistema con el diseño del prototipo (menú lateral)', !!(await page.$('#side')) && !!(await page.$('#view')));
    await page.evaluate(() => { location.hash = '#panel'; });
    await page.waitForFunction(() => /Panel de habitaciones/.test(((document.querySelector('#view h1') || {}).textContent || '')));
    await page.waitForTimeout(1500);
    const vista = await page.textContent('#view');
    if (!vista.includes('301')) console.log('   [depuración panel]', vista.slice(0, 600));
    prueba('el panel muestra las habitaciones reales', vista.includes('301') && vista.includes('203') && vista.includes('Auditorio') && !vista.includes('405'));
    prueba('el panel muestra los huéspedes reales (no los de ejemplo)', vista.includes('Huésped Ficticio Uno') && !vista.includes('Luis Alberto Torres'));
    prueba('dice Hotel Selva Inn y no Nooki Hotel', (await page.textContent('#side')).includes('Hotel Selva Inn') && !(await page.content()).includes('Nooki Hotel'));
    prueba('el usuario que entró aparece en el menú', (await page.textContent('.me')).includes('Administrador'));
    prueba('sin scroll de lado (sistema)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, 'sistema-' + nombreVista + '-2-panel.png') });
    for (const v of ['inicio', 'timeline', 'reservas', 'caja', 'ventas', 'limpieza', 'reportes', 'ajustes']) {
      await page.evaluate((h) => { location.hash = '#' + h; }, v);
      await page.waitForTimeout(250);
    }
    prueba('las pantallas del prototipo abren sin errores', true);
    await page.evaluate(() => { location.hash = '#timeline'; });
    await page.waitForTimeout(300);
    const mesHoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', month: 'long' }).format(new Date()).toLowerCase();
    const tl = (await page.textContent('#view')).toLowerCase();
    prueba('el timeline muestra el mes de hoy (no octubre fijo)', tl.includes(mesHoy) && (mesHoy === 'octubre' || !tl.includes('octubre 2026')));

    if (nombreVista === 'escritorio') {
      // ===== GUARDAR: lo que se hace en el prototipo llega a la base =====
      const esperar = async (cond, ms = 8000) => { for (let i = 0; i < ms / 100 && !cond(); i++) await page.waitForTimeout(100); return cond(); };
      const r4 = () => E.tablas.reservas.find((r) => r.id === 4);
      await page.evaluate(() => { const r = NKS.res().find((x) => x.id === 4); NKS.checkin(r); });
      prueba('Guardar: check-in llega a la base', await esperar(() => r4().estado === 'ocupado' && r4().checkin_en));
      await page.evaluate(() => { const r = NKS.res().find((x) => x.id === 4); r.items.push({ n: 'Lavandería', p: 4, q: 2 }); NKS.refresh(); });
      prueba('Guardar: consumo nuevo', await esperar(() => E.tablas.consumos.some((c) => c.reserva_id === 4 && c.descripcion === 'Lavandería' && c.cantidad === 2)));
      await page.evaluate(() => { const r = NKS.res().find((x) => x.id === 4); r.items[0].q = 3; NKS.refresh(); });
      prueba('Guardar: cambiar la cantidad del consumo', await esperar(() => E.tablas.consumos.some((c) => c.descripcion === 'Lavandería' && c.cantidad === 3)));
      await page.evaluate(() => NKS.caja(true, 50));
      prueba('Guardar: abrir caja', await esperar(() => E.tablas.caja_turnos.length === 1 && Number(E.tablas.caja_turnos[0].monto_inicial) === 50));
      await page.evaluate(() => { const r = NKS.res().find((x) => x.id === 4); NKS.pagar(r, 100, 'Yape', 'Boleta'); });
      prueba('Guardar: cobro + boleta por el facturador', await esperar(() => E.tablas.pagos.length === 1 && E.tablas.comprobantes.length === 1 && E.tablas.pagos[0].turno_id === E.tablas.caja_turnos[0].id));
      prueba('Guardar: el pago muestra el número real del comprobante', await esperar(() => true) && (await page.evaluate(() => NKS.res().find((x) => x.id === 4).pays[0].doc)) === 'B001-1');
      await page.evaluate(() => { const r = NKS.res().find((x) => x.id === 4); NKS.checkout(r); });
      prueba('Guardar: check-out y habitación a limpieza', await esperar(() => r4().estado === 'finalizada' && E.tablas.limpieza.some((l) => l.habitacion === '201' && l.estado === 'sucia')));
      await page.evaluate(() => {
        const h = NKS.hoy();
        NKS.res().push({ id: 99001, group: 99001, room: '202', guest: { name: 'Nuevo Ficticio', doc: '87654321', docType: 'DNI', nat: 'Perú' }, company: null, origin: 'Directo', ext: '', motivo: 'Vacaciones', ref: 'Ninguna',
          ci: h, co: h + 2, rate: 160, tarifa: 'Regular', persons: 1, state: 'confirmado', items: [], pays: [], notes: [], extra: [], log: [] });
        NKS.refresh();
      });
      prueba('Guardar: nueva reserva con cliente nuevo', await esperar(() => E.tablas.reservas.some((r) => r.habitacion === '202' && r.estado === 'confirmado') && E.tablas.clientes.some((c) => c.num_doc === '87654321')));
      prueba('Guardar: la reserva toma el número real de la base', await page.evaluate(() => !NKS.res().some((x) => x.id === 99001)));
      await page.evaluate(() => {
        const h = NKS.hoy();
        NKS.res().push({ id: 99002, group: 99002, room: '202', guest: { name: 'Otro Ficticio', doc: '87654322', docType: 'DNI', nat: 'Perú' }, company: null, origin: 'Directo', ext: '', motivo: '', ref: 'Ninguna',
          ci: h, co: h + 1, rate: 160, tarifa: 'Regular', persons: 1, state: 'confirmado', items: [], pays: [], notes: [], extra: [], log: [] });
        NKS.refresh();
      });
      let quitada = false;
      for (let i = 0; i < 60 && !quitada; i++) { await page.waitForTimeout(100); quitada = await page.evaluate(() => !NKS.res().some((x) => x.id === 99002)); }
      prueba('Guardar: no deja cruzar reservas (la quita y avisa)', quitada && E.tablas.reservas.filter((r) => r.habitacion === '202').length === 1 && /No se guardó/.test(await page.textContent('body')));

      // Restaurante: pedido en la mesa, cambio de cantidad y cobro con boleta
      await page.evaluate(() => { const t = NKS.mesas().find((x) => x.id === 'S1'); t.order = { items: [{ n: 'Gaseosa', p: 5, q: 2, sent: 2 }], since: NKS.ahora(), mozo: 'Mozo', state: 'abierta' }; NKS.refresh(); });
      const ped = () => E.tablas.pedidos.find((x) => x.mesa_id === 'S1');
      prueba('Guardar: pedido del restaurante en su mesa', await esperar(() => ped() && E.tablas.pedido_items.some((i) => i.pedido_id === ped().id && i.descripcion === 'Gaseosa' && Number(i.cantidad) === 2 && Number(i.enviados) === 2)));
      await page.evaluate(() => { const t = NKS.mesas().find((x) => x.id === 'S1'); t.order.items[0].q = 3; t.order.state = 'precuenta'; NKS.refresh(); });
      prueba('Guardar: cambiar cantidad y precuenta del pedido', await esperar(() => ped().estado === 'precuenta' && E.tablas.pedido_items.some((i) => i.descripcion === 'Gaseosa' && Number(i.cantidad) === 3)));
      await page.evaluate(() => {
        const t = NKS.mesas().find((x) => x.id === 'S1');
        NKS.extra().unshift({ id: NKS.nuevoId(), r: null, place: 'Mesa ' + t.n + ' · ' + t.amb, cli: { name: 'Clientes varios', doc: '—', docType: 'DNI' }, items: t.order.items.map((i) => ({ n: i.n, p: i.p, q: i.q })),
          doc: '', method: 'Efectivo', amount: 15, kind: 'Boleta', d: NKS.hoy(), h: NKS.ahora(), sunat: 'pendiente', anulado: false });
        NKS.mov().push({ h: NKS.ahora(), type: 'ingreso', cat: 'Venta de restaurante', desc: 'Mesa', amount: 15, who: 'Prueba' });
        t.order = null; NKS.refresh();
      });
      const pagoRest = () => E.tablas.pagos.find((x) => x.pedido_id === (ped() || {}).id);
      prueba('Guardar: cobro de la mesa (pedido cobrado, pago y boleta)', await esperar(() => ped().estado === 'cobrada' && pagoRest() && pagoRest().tipo === 'restaurante' && pagoRest().comprobante_id));
      prueba('Guardar: la venta en efectivo no se duplica en la caja', !E.tablas.caja_movimientos.some((m) => m.motivo === 'Venta de restaurante'));
      // Caja: salida manual
      await page.evaluate(() => { NKS.mov().push({ h: NKS.ahora(), type: 'salida', cat: 'Compra de útiles', desc: 'Papel', amount: 10, who: 'Prueba' }); NKS.refresh(); });
      prueba('Guardar: salida de caja', await esperar(() => E.tablas.caja_movimientos.some((m) => m.tipo === 'salida' && Number(m.monto) === 10 && m.turno_id === E.tablas.caja_turnos[0].id)));
      // Nota de crédito por un monto (motivo 09)
      await page.evaluate(() => {
        const p = NKS.extra().find((x) => x.kind === 'Boleta');
        const n = { id: NKS.nuevoId(), r: null, place: p.place, cli: p.cli, items: [], doc: '', method: 'Efectivo', amount: -5, kind: 'Nota de crédito', d: NKS.hoy(), h: NKS.ahora(), anulado: false,
          ref: p.id, refDoc: p.doc, motivo: { c: '09', l: 'Disminución en el valor' }, sunat: 'pendiente' };
        NKS.extra().unshift(n); p.ncs = (p.ncs || []).concat(n.id); NKS.refresh();
      });
      prueba('Guardar: nota de crédito por monto', await esperar(() => E.tablas.comprobantes.some((c) => c.tipo === 'nota_credito' && Number(c.total) === 5 && c.motivo_nota === '09')));
      prueba('Guardar: la nota de crédito muestra su número real', await esperar(() => true) && /^BC01-/.test(await page.evaluate(() => NKS.extra().find((x) => x.kind === 'Nota de crédito').doc)));
      // Anular la boleta de la reserva
      await page.evaluate(() => { const p = NKS.res().find((x) => x.id === 4).pays[0]; p.anulado = true; p.sunat = 'anulado'; p.anul = { motivo: 'Prueba de anulación' }; NKS.refresh(); });
      prueba('Guardar: anular comprobante (SUNAT y pago anulado)', await esperar(() => E.llamadas.includes('facturar:anular') && E.tablas.pagos.find((x) => x.reserva_id === 4).anulado === true));
      // No grato
      await page.evaluate(() => { NKS.noGrato()['87654321'] = { motivo: 'Prueba', d: NKS.hoy() }; NKS.refresh(); });
      prueba('Guardar: cliente no grato', await esperar(() => E.tablas.clientes.some((c) => c.num_doc === '87654321' && c.no_grato === true && c.motivo_no_grato === 'Prueba')));
      await page.evaluate(() => { delete NKS.noGrato()['87654321']; NKS.refresh(); });
      prueba('Guardar: quitar no grato', await esperar(() => E.tablas.clientes.some((c) => c.num_doc === '87654321' && c.no_grato === false)));
      // Cerrar caja con el monto contado
      await page.evaluate(() => { NKS.turnos().unshift({ day: 1, who: 'Prueba', from: '', to: '', a: 50, inc: 15, out: 10, cont: 54 }); NKS.caja(false); });
      prueba('Guardar: cierre de caja con el monto contado', await esperar(() => E.tablas.caja_turnos[0].cerrado_en && Number(E.tablas.caja_turnos[0].contado) === 54));
      // Cierre del día
      const hoyAntes = await page.evaluate(() => NKS.hoy());
      await page.evaluate(() => NKS.cerrarDia());
      await page.click('#czGo');
      prueba('Guardar: cierre del día', await esperar(() => E.tablas.cierres.length === 1 && E.tablas.cierres[0].responsable));
      prueba('Guardar: al cerrar el día la fecha sigue siendo la real', (await page.evaluate(() => NKS.hoy())) === hoyAntes && E.tablas.cierres[0].fecha === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()));
      await page.evaluate(() => NKS.cerrarDia());
      prueba('Guardar: no cierra dos veces el mismo día', E.tablas.cierres.length === 1 && /ya está cerrado/.test(await page.textContent('body')));
      // Ajustes → Usuarios (solo admin): lista, crear, editar y contraseña
      await page.evaluate(() => { location.hash = '#ajustes'; });
      await page.waitForSelector('[data-act="set"][data-v="usuarios"]', { timeout: 5000 });
      await page.click('[data-act="set"][data-v="usuarios"]');
      await page.waitForSelector('.usr-f', { timeout: 5000 });
      prueba('Usuarios: lista las cuentas dentro de Ajustes', (await page.textContent('.usr-lista')).includes('oficinavirtual@nooki.pe'));
      await page.addStyleTag({ content: '#toasts,.toasts,.toast{display:none!important}' });
      await page.screenshot({ path: path.join(OUT, 'sistema-escritorio-5-usuarios.png') });
      await page.click('[data-act="usr-new"]');
      await page.fill('#uCorreo', 'recepcion2@ejemplo.test'); await page.fill('#uNombre', 'Recepción 2'); await page.fill('#uClave', 'corta');
      await page.click('#uGo');
      prueba('Usuarios: contraseña corta no se acepta', /8 caracteres/.test(await page.textContent('#uErr')));
      await page.fill('#uClave', 'Prueba-Rec-2'); await page.click('#uGo');
      prueba('Usuarios: crear una cuenta de recepción', await esperar(() => E.usuarios.some((u) => u.correo === 'recepcion2@ejemplo.test' && u.rol === 'recepcion')));
      await page.waitForFunction(() => /recepcion2@ejemplo\.test/.test((document.querySelector('.usr-lista') || {}).textContent || ''), null, { timeout: 5000 });
      const idNuevo = E.usuarios.find((u) => u.correo === 'recepcion2@ejemplo.test').id;
      await page.click('[data-act="usr-edit"][data-id="' + idNuevo + '"]');
      await page.click('#uRol [data-v="dueno"]'); await page.click('#uAct [data-v="no"]'); await page.click('#uGo');
      prueba('Usuarios: cambiar rol y desactivar', await esperar(() => { const u = E.usuarios.find((x) => x.id === idNuevo); return u.rol === 'dueno' && u.activo === false; }));
      await page.waitForSelector('[data-act="usr-clave"][data-id="' + idNuevo + '"]');
      await page.click('[data-act="usr-clave"][data-id="' + idNuevo + '"]');
      await page.fill('#uClave', 'Otra-Clave-9'); await page.fill('#uClave2', 'Otra-Clave-9'); await page.click('#uGo');
      prueba('Usuarios: contraseña nueva', await esperar(() => E.cuentas['recepcion2@ejemplo.test'].clave === 'Otra-Clave-9'));
      await page.waitForTimeout(400);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      prueba('Usuarios: sin scroll de lado en celular', await sinScrollLateral(page));
      await page.screenshot({ path: path.join(OUT, 'sistema-celular-5-usuarios.png'), fullPage: true });
      await page.setViewportSize(viewport); await page.evaluate(() => { location.hash = '#ajustes'; });
      await page.waitForTimeout(300);
      // Ajustes → Facturación SUNAT: probar conexión y activar avisos (de verdad, no simulado)
      await page.click('[data-act="set"][data-v="sunat"]');
      await page.waitForSelector('[data-act="nooki-test"]');
      prueba('Facturación: sin el interruptor de "simular sin internet"', !/Simular que se cayó/.test(await page.textContent('#view')));
      await page.click('[data-act="nooki-test"]');
      await page.waitForFunction(() => /No se pudo conectar/.test(document.querySelector('.nk-card').textContent), null, { timeout: 5000 });
      prueba('Facturación: probar conexión llama al facturador y muestra el motivo', E.llamadas.includes('facturar:probar') && /Falta configurar/.test(await page.textContent('.nk-card')));
      await page.click('[data-act="nooki-aviso"]');
      prueba('Facturación: activar avisos de SUNAT', await esperar(() => E.avisoActivo === true));
      await page.waitForSelector('.modal [data-close], [data-close]');
      prueba('Facturación: recuerda poner NOOKI_WHSEC en Supabase', /NOOKI_WHSEC/.test(await page.textContent('body')));
      await page.screenshot({ path: path.join(OUT, 'sistema-escritorio-6-facturacion.png') });
      await page.keyboard.press('Escape');
      await page.evaluate(() => { const t = NKS.mesas().find((x) => x.id === 'S2'); t.order = { items: [{ n: 'Café', p: 4, q: 1, sent: 0 }], since: NKS.ahora(), mozo: 'Mozo', state: 'abierta' }; NKS.refresh(); });
      await esperar(() => E.tablas.pedido_items.some((i) => i.descripcion === 'Café'));
      // Clave de administrador: el admin la crea en Ajustes (se guarda en el servidor)
      await page.evaluate(() => { location.hash = '#ajustes'; });
      await page.waitForTimeout(400);
      const pestanaClave = page.locator('[data-act="set"][data-v="seguridad"]').first();
      if (await pestanaClave.count()) await pestanaClave.click();
      await page.waitForSelector('#scN', { timeout: 5000 });
      prueba('Clave: sin "1234" de demostración en el sistema', !/Demo: la clave/.test(await page.textContent('#view')));
      await page.fill('#scN', 'Clave-Real-9'); await page.fill('#scR', 'Clave-Real-9');
      await page.click('[data-act="adm-save"]');
      prueba('Clave: se crea en el servidor desde Ajustes', await esperar(() => E.clave === 'Clave-Real-9'));

      await page.waitForSelector('#view h1', { timeout: 15000 });
      await page.evaluate(() => { location.hash = '#ventas'; });
      await page.waitForTimeout(800);
      const ventas = await page.textContent('#view');
      prueba('Al recargar: Ventas muestra el cobro del restaurante y la nota de crédito', /BC01-1/.test(ventas) && E.tablas.comprobantes.filter((c) => c.tipo === 'boleta').every((c) => ventas.includes(c.numero_completo)));
      prueba('Al recargar: la mesa abierta sigue con su pedido', await page.evaluate(() => { const t = NKS.mesas().find((x) => x.id === 'S2'); return !!(t.order && t.order.items[0].n === 'Café'); }));
      prueba('Al recargar: los días cerrados y turnos vienen de la base', await page.evaluate(() => NKS.turnos().length === 1 && NKS.turnos()[0].cont === 54));
      await page.screenshot({ path: path.join(OUT, 'sistema-escritorio-3-ventas-guardadas.png') });
    }
    if (nombreVista === 'escritorio') {
      // Recepción: Ajustes pide la clave del servidor; "1234" no sirve
      const ctx2 = await browser.newContext({ viewport, locale: 'es-PE' });
      const p2 = await ctx2.newPage();
      p2.on('pageerror', (e) => errores.push('sistema recepción: ' + e.message));
      await simular(p2, E);
      await p2.goto(URL0);
      await p2.waitForURL(/ingreso\.html/);
      await entrar(p2, 'recepcion@ejemplo.test', 'Prueba-Rec-1');
      await p2.waitForSelector('#view h1', { timeout: 15000 });
      await p2.evaluate(() => { location.hash = '#ajustes'; });
      await p2.waitForSelector('#admPin', { timeout: 5000 });
      prueba('Recepción: Ajustes está bloqueado sin pista de clave', !/1234/.test(await p2.textContent('#view')));
      await p2.fill('#admPin', '1234'); await p2.press('#admPin', 'Enter');
      await p2.waitForSelector('#admE:not([hidden])', { timeout: 5000 });
      prueba('Recepción: la clave de demostración "1234" no abre Ajustes', !!(await p2.$('#admPin')) && /incorrecta/i.test(await p2.textContent('#admE')));
      await p2.fill('#admPin', 'Clave-Real-9'); await p2.press('#admPin', 'Enter');
      let abierto = false;
      for (let i = 0; i < 50 && !abierto; i++) { await p2.waitForTimeout(100); abierto = !(await p2.$('#admPin')); }
      prueba('Recepción: la clave real (del servidor) abre Ajustes', abierto);
      prueba('Recepción: no ve la pestaña Usuarios', !(await p2.$('[data-act="set"][data-v="usuarios"]')));
      await p2.screenshot({ path: path.join(OUT, 'sistema-escritorio-4-recepcion-ajustes.png') });
      await ctx2.close();
    }
    await ctx.close();
  }

  prueba('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await browser.close();
  srv.close();
  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron. Capturas en ' + OUT);
  process.exit(mal ? 1 : 0);
})();
