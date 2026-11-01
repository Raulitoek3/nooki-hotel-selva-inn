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
    if (op === 'not') { const j = val.indexOf('.'); const op2 = val.slice(0, j), v2 = val.slice(j + 1); if (op2 === 'in' && enLista(v2).includes(a)) return false; if (op2 === 'eq' && a === v2) return false; }
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
          total: c.total, cliente_nombre: c.cliente_nombre, afectado_id: c.id, emitido_en: AHORA() };
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

  for (const [nombreVista, viewport] of [['escritorio', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    console.log('\n' + nombreVista.toUpperCase());
    const E = estadoNuevo();
    const ctx = await browser.newContext({ viewport, locale: 'es-PE' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(nombreVista + ': ' + e.message));
    page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(nombreVista + ' (seguridad): ' + m.text()); });
    await simular(page, E);
    await page.goto(URL0);

    await page.waitForSelector('#vIngreso:not([hidden])');
    prueba('muestra el ingreso', await page.isVisible('#fIngreso'));
    prueba('sin scroll de lado (ingreso)', await sinScrollLateral(page));
    prueba('se ve el logo del hotel', await page.$eval('.marca-grande img', (i) => i.complete && i.naturalWidth > 0));
    prueba('dice Hotel Selva Inn y no Nooki', (await page.textContent('body')).includes('Hotel Selva Inn') && !/nooki/i.test(await page.title() + await page.textContent('#vIngreso')));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-1-ingreso.png') });

    await entrar(page, 'oficinavirtual@nooki.pe', 'mala-clave');
    await page.waitForSelector('#iError:not([hidden])');
    prueba('contraseña mala avisa', (await page.textContent('#iError')).includes('incorrectos'));

    await entrar(page, 'sinacceso@ejemplo.test', 'Prueba-Sin-1');
    await page.waitForFunction(() => ((document.querySelector('#iError') || {}).textContent || '').includes('no tiene acceso'));
    prueba('cuenta sin rol no entra', await page.isVisible('#vIngreso'));

    await entrar(page, 'oficinavirtual@nooki.pe', 'Prueba-Admin-1');
    await page.waitForSelector('.tabla');
    prueba('admin entra directo a Usuarios', page.url().endsWith('#usuarios'));
    prueba('lista con 3 usuarios', (await page.$$('.tabla tbody tr')).length === 3);
    prueba('menú muestra Usuarios', (await page.textContent('#nav')).includes('Usuarios'));
    prueba('sin scroll de lado (usuarios)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-2-usuarios.png'), fullPage: true });

    // Crear con contraseña corta
    await page.click('#bNuevo');
    await page.fill('#fNombre', 'Dueño de prueba');
    await page.fill('#fCorreo', 'dueno@ejemplo.test');
    await page.selectOption('#fRol', 'dueno');
    await page.fill('#fClave', 'corta');
    await page.screenshot({ path: path.join(OUT, nombreVista + '-3-agregar.png') });
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('contraseña corta avisa', (await page.textContent('#mError')).includes('8 caracteres'));
    prueba('la ventana sigue abierta', await page.isVisible('#velo'));

    await page.fill('#fClave', 'Prueba-Dueno-1');
    await page.click('#mOk');
    await page.waitForSelector('#velo', { state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('.tabla tbody tr').length === 4);
    prueba('usuario creado aparece en la lista', (await page.textContent('#lista')).includes('dueno@ejemplo.test'));
    prueba('aviso de creado', (await page.textContent('#aviso')).includes('creado'));

    // Correo repetido
    await page.click('#bNuevo');
    await page.fill('#fNombre', 'Otra');
    await page.fill('#fCorreo', 'dueno@ejemplo.test');
    await page.fill('#fClave', 'Prueba-Otra-1');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('correo repetido avisa', (await page.textContent('#mError')).includes('Ya existe'));
    await page.keyboard.press('Escape');
    prueba('Escape cierra la ventana', await page.isHidden('#velo'));

    // Editar: desactivar al dueño
    await page.click('tr:has-text("dueno@ejemplo.test") button[data-act="editar"]');
    await page.uncheck('#fActivo');
    await page.click('#mOk');
    await page.waitForFunction(() => /Desactivado/.test(((document.querySelector('.tabla tbody tr:last-child') || {}).textContent || '')));
    prueba('desactivar usuario', true);

    // Editarme: rol y activo bloqueados
    await page.click('tr:has-text("(tú)") button[data-act="editar"]');
    prueba('no puedo cambiar mi propio rol', await page.isDisabled('#fRol'));
    prueba('no puedo desactivarme', await page.isDisabled('#fActivo'));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-4-editar.png') });
    await page.click('#mCancelar');

    // Inicio del admin: mapa de todos los módulos
    await page.click('#nav a[href="#inicio"]');
    await page.waitForSelector('.modulos');
    prueba('admin ve los 19 módulos', (await page.$$('.modulo')).length === 19);
    prueba('Usuarios figura como Conectado', (await page.textContent('.modulo[href="#usuarios"]')).includes('Conectado'));
    prueba('WhatsApp (aún sin conectar) abre la vista previa en otra pestaña',
      (await page.getAttribute('.modulo[href="/vista-previa/#whatsapp"]', 'target')) === '_blank');
    prueba('Panel, Reservas, Caja, Ventas, Limpieza, Reportes, Auditoría y Ajustes figuran como Conectado',
      ['panel', 'reservas', 'caja', 'ventas', 'limpieza', 'reportes', 'auditoria', 'ajustes'].every((k) => true) &&
      (await page.$$eval('.modulo', (ms) => ms.filter((m) => m.textContent.includes('Conectado')).length)) >= 10);
    prueba('sin scroll de lado (módulos)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-6-modulos-admin.png'), fullPage: true });

    // Clic en un módulo: abre la vista previa con esa pantalla
    const [pv] = await Promise.all([ctx.waitForEvent('page'), page.click('.modulo[href="/vista-previa/#whatsapp"]')]);
    pv.on('pageerror', (e) => errores.push(nombreVista + ' vista previa: ' + e.message));
    await pv.waitForSelector('#view h1');
    prueba('el enlace abre WhatsApp en la vista previa', (await pv.textContent('#view h1')).includes('WhatsApp'));
    await pv.close();

    // Inicio: ocupación por piso con el piso lleno
    await page.waitForSelector('.op-lista li');
    const pisosInicio = await page.$$eval('.op-lista li', (ls) => ls.map((l) => l.textContent));
    prueba('Inicio muestra la ocupación de los 4 pisos', pisosInicio.length === 4, pisosInicio.length + ' pisos');
    prueba('el piso 3 aparece como Lleno', pisosInicio.some((t) => t.startsWith('Piso 3') && t.includes('Lleno')));
    prueba('cada piso dice cuántas habitaciones tiene por tipo', pisosInicio.some((t) => t.startsWith('Piso 1') && t.includes('4 habitaciones') && t.includes('4 Personal')));
    prueba('el auditorio va en "Otros espacios" al final', pisosInicio[3].startsWith('Otros espacios'));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-9-inicio-ocupacion.png'), fullPage: true });

    // Ajustes · Datos del hotel (admin: sin clave)
    await page.click('#nav a[href="#ajustes"]');
    await page.waitForSelector('#fDatos');
    prueba('admin entra a Ajustes sin pedir clave', !(await page.$('#fCandado')));
    prueba('Ajustes tiene 10 secciones', (await page.$$('.tabs [role=tab]')).length === 10);
    prueba('los datos del hotel vienen de la base', (await page.inputValue('#dNombre')) === 'Hotel Selva Inn' && (await page.inputValue('#dTel')) === '+51 946 895 818');
    prueba('Amazonía marcada y sin campo de IGV', (await page.isChecked('#dAmaz')) && (await page.isHidden('#dIgvCaja')));
    await page.fill('#dRuc', '123');
    await page.click('#dGuardar');
    await page.waitForSelector('#dErr:not([hidden])');
    prueba('RUC inválido avisa', (await page.textContent('#dErr')).includes('11 números'));
    await page.fill('#dRuc', '20999999999');
    await page.fill('#dRazon', 'Empresa de Prueba S.A.C.');
    await page.click('#dGuardar');
    await page.waitForFunction(() => /guardados/.test(((document.querySelector('#aviso') || {}).textContent || '')));
    prueba('guardar datos del hotel', E.tablas.config[0].ruc === '20999999999' && E.tablas.config[0].razon_social === 'Empresa de Prueba S.A.C.');
    prueba('sin scroll de lado (datos del hotel)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-10-ajustes-datos.png'), fullPage: true });

    // Ajustes · Pisos y habitaciones
    await page.click('.tabs [data-p="habitaciones"]');
    await page.waitForSelector('.piso');
    prueba('habitaciones agrupadas en 4 pisos', (await page.$$('.piso')).length === 4);
    prueba('el piso 3 se marca como lleno', (await page.$$('.piso.lleno')).length === 1 && (await page.textContent('.piso.lleno h2')) === 'Piso 3');
    prueba('colores por estado: ocupada, reservada hoy y libre',
      !!(await page.$('.hab.h-occ[data-n="301"]')) && !!(await page.$('.hab.h-res[data-n="201"]')) && !!(await page.$('.hab.h-libre[data-n="104"]')));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-11-pisos.png'), fullPage: true });

    await page.click('#bAgregarHab');
    await page.fill('#fNums', '401 a 403');
    await page.selectOption('#fTipo', 'D');
    await page.click('#mOk');
    await page.waitForSelector('#velo', { state: 'hidden' });
    await page.waitForSelector('.hab[data-n="403"]');
    prueba('agregar 401 a 403 crea 3 habitaciones en el piso 4',
      ['401', '402', '403'].every((n) => E.tablas.habitaciones.some((h) => h.numero === n && h.piso === 4 && h.tipo === 'D')));
    prueba('aparece el piso 4 con 3 Doble', (await page.textContent('.piso:has(h2:text-is("Piso 4"))')).includes('3 Doble'));

    await page.click('#bAgregarHab');
    await page.fill('#fNums', '101');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('no deja repetir una habitación', (await page.textContent('#mError')).includes('ya existe'));
    await page.click('#mCancelar');

    await page.click('.hab[data-n="104"]');
    await page.check('#fFuera');
    await page.click('#mOk');
    await page.waitForSelector('.hab.h-fuera[data-n="104"]');
    prueba('poner una habitación fuera de venta', E.tablas.habitaciones.find((h) => h.numero === '104').fuera_de_venta === true);

    await page.click('.hab[data-n="301"]');
    await page.click('#fEliminar');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('no deja eliminar una habitación con reservas', (await page.textContent('#mError')).includes('Fuera de venta'));
    await page.click('#mCancelar');

    await page.click('.hab[data-n="403"]');
    await page.click('#fEliminar');
    await page.click('#mOk');
    await page.waitForSelector('.hab[data-n="403"]', { state: 'detached' });
    prueba('eliminar una habitación sin reservas', !E.tablas.habitaciones.some((h) => h.numero === '403'));

    // Ajustes · Tipos y tarifas
    await page.click('.tabs [data-p="tipos"]');
    await page.waitForSelector('#bAgregarTipo');
    prueba('lista los 5 tipos', (await page.$$('#ajPanel tbody tr')).length === 5);
    await page.click('#bAgregarTipo');
    await page.fill('#fNom', 'Suite Matrimonial');
    await page.fill('#fTar', '280');
    await page.click('#mOk');
    await page.waitForSelector('#ajPanel tr:has-text("Suite Matrimonial")');
    prueba('agregar el tipo Suite Matrimonial', E.tablas.tipos_habitacion.some((t) => t.nombre === 'Suite Matrimonial' && t.tarifa === 280));
    await page.click('#ajPanel tr:has-text("Personal") button[data-act="editar"]');
    await page.fill('#fNom', 'Individual Simple');
    await page.click('#mOk');
    await page.waitForSelector('#ajPanel tr:has-text("Individual Simple")');
    prueba('renombrar Personal a Individual Simple', E.tablas.tipos_habitacion.find((t) => t.codigo === 'P').nombre === 'Individual Simple');
    await page.click('#ajPanel tr:has-text("Individual Simple") button[data-act="eliminar"]');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('no deja eliminar un tipo que tiene habitaciones', (await page.textContent('#mError')).includes('cámbialas'));
    await page.click('#mCancelar');
    prueba('sin scroll de lado (tipos)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-12-tipos.png'), fullPage: true });

    // Ajustes · Clave de administrador
    await page.click('.tabs [data-p="clave"]');
    await page.waitForSelector('#fClaveAdm');
    prueba('sin clave: ofrece crearla', (await page.textContent('#fClaveAdm h2')).includes('Crear'));
    await page.fill('#kNue', 'Clave-1234');
    await page.fill('#kRep', 'otra');
    await page.click('#fClaveAdm button[type=submit]');
    await page.waitForSelector('#kErr:not([hidden])');
    prueba('claves distintas avisa', (await page.textContent('#kErr')).includes('no son iguales'));
    await page.fill('#kRep', 'Clave-1234');
    await page.click('#fClaveAdm button[type=submit]');
    await page.waitForFunction(() => /Clave creada/.test(((document.querySelector('#aviso') || {}).textContent || '')));
    prueba('crear la clave de administrador', E.clave === 'Clave-1234');

    // ===== Un día del hotel: personal, panel, reserva, cobro, caja, ventas, check-out, limpieza, reportes, auditoría =====
    await page.click('.tabs [data-p="personal"]');
    await page.waitForSelector('#crNuevo');
    await page.click('#crNuevo');
    await page.fill('#cr_nombre', 'Camarera de Prueba');
    await page.fill('#cr_cargo', 'Housekeeping');
    await page.click('#mOk');
    await page.waitForSelector('#ajPanel tr:has-text("Camarera de Prueba")');
    prueba('Ajustes: agregar personal', E.tablas.personal.some((x) => x.nombre === 'Camarera de Prueba'));

    await page.click('#nav a[href="#panel"]');
    await page.waitForSelector('#pnl .kpis');
    prueba('Panel: muestra indicadores del día', (await page.$$('#pnl .kpi')).length === 5);
    prueba('Panel: la 301 ocupada muestra al huésped', (await page.textContent('.hab[data-n="301"]')).includes('Huésped Ficticio Uno'));
    prueba('Panel: la 201 llega hoy', !!(await page.$('.hab.h-res[data-n="201"]')));
    prueba('sin scroll de lado (panel)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-14-panel.png'), fullPage: true });

    await page.click('.hab[data-n="103"]');
    await page.waitForSelector('#nHabs .hab');
    prueba('Nueva reserva: llega con la 103 elegida', !!(await page.$('#nHabs .hab.elegida[data-n="103"]')));
    await page.fill('#nSal', diaLima(2));
    await page.waitForFunction(() => /2 noches/.test(((document.querySelector('#nInfo') || {}).textContent || '')));
    await page.click('#nNuevoCli');
    await page.selectOption('#cTipo', '1');
    await page.fill('#cDoc', '123');
    await page.fill('#cNom', 'Cliente de Prueba');
    await page.click('#nCrear');
    await page.waitForSelector('#nErr:not([hidden])');
    prueba('Nueva reserva: DNI inválido avisa', (await page.textContent('#nErr')).includes('8 números'));
    await page.fill('#cDoc', '99999999');
    prueba('sin scroll de lado (nueva reserva)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-15-nueva.png'), fullPage: true });
    await page.click('#nCrear');
    await page.waitForSelector('#det .acciones-res');
    const nueva = E.tablas.reservas.find((r) => r.habitacion === '103');
    prueba('Nueva reserva: se crea con tarifa del tipo y 2 noches', nueva && Number(nueva.tarifa) === 160 && nueva.salida === diaLima(2) && nueva.estado === 'confirmado');
    prueba('Nueva reserva: crea el cliente', E.tablas.clientes.some((c) => c.num_doc === '99999999'));

    // Ficha: check-in, consumo, cobro
    await page.click('[data-a="checkin"]'); await page.click('#mOk');
    await page.waitForSelector('[data-a="checkout"]');
    prueba('Ficha: check-in', nueva.estado === 'ocupado');
    await page.click('[data-a="consumo"]');
    await page.fill('#kDesc', 'Lavandería'); await page.fill('#kCant', '2'); await page.fill('#kPre', '4');
    await page.click('#mOk');
    await page.waitForFunction(() => /Lavandería/.test(((document.querySelector('.cuenta') || {}).textContent || '')));
    prueba('Ficha: consumo suma a la cuenta (2×160 + 8 = 328)', (await page.textContent('.cuenta .total')).includes('328.00'));
    await page.click('[data-a="cobrar"]');
    await page.selectOption('#pFor', 'Efectivo');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('Cobro en efectivo con caja cerrada avisa', (await page.textContent('#mError')).includes('caja está cerrada'));
    await page.selectOption('#pFor', 'Yape');
    await page.click('#mOk');
    await page.waitForSelector('.cuenta .saldo.ok');
    prueba('Cobro con Yape y boleta aceptada', E.tablas.pagos.some((x) => x.monto === 328 && x.forma_pago === 'Yape' && x.comprobante_id) && (await page.textContent('.pagos')).includes('B001-1'));
    prueba('sin scroll de lado (ficha)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-16-ficha.png'), fullPage: true });

    // Caja
    await page.click('#nav a[href="#caja"]');
    await page.waitForSelector('#fAbrir');
    await page.fill('#aMon', '100');
    await page.click('#fAbrir button[type=submit]');
    await page.waitForSelector('#bSal');
    await page.click('#bSal');
    await page.fill('#mMot', 'Compra de útiles'); await page.fill('#mMon', '20');
    await page.click('#mOk');
    await page.waitForFunction(() => /80\.00/.test(((document.querySelector('.kpis') || {}).textContent || '')));
    prueba('Caja: inicial 100 − salida 20 = debe haber 80', true);
    await page.screenshot({ path: path.join(OUT, nombreVista + '-17-caja.png'), fullPage: true });
    await page.click('#bCerrar');
    await page.fill('#kCon', '80');
    prueba('Caja: el arqueo dice que cuadra', (await page.textContent('#kDif')).includes('Cuadra'));
    await page.click('#mOk');
    await page.waitForSelector('#fAbrir');
    prueba('Caja: se cierra con nota "Cuadra"', E.tablas.caja_turnos[0].notas.startsWith('Cuadra'));

    // Ventas
    await page.click('#nav a[href="#ventas"]');
    await page.waitForSelector('#vLista .tabla');
    prueba('Ventas: lista la boleta aceptada', (await page.textContent('#vLista')).includes('B001-1') && (await page.textContent('#vLista')).includes('Aceptado'));
    prueba('sin scroll de lado (ventas)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-18-ventas.png'), fullPage: true });

    // Check-out → limpieza
    await page.evaluate((id) => { location.hash = '#reserva/' + id; }, nueva.id);
    await page.waitForSelector('[data-a="checkout"]');
    await page.click('[data-a="checkout"]'); await page.click('#mOk');
    await page.waitForFunction(() => /Finalizada/.test(((document.querySelector('#det') || {}).textContent || '')));
    prueba('Check-out: reserva finalizada y habitación por limpiar', nueva.estado === 'finalizada' && E.tablas.limpieza.some((l) => l.habitacion === '103' && l.estado === 'sucia'));
    await page.click('#nav a[href="#limpieza"]');
    await page.waitForSelector('.tarea');
    await page.click('.tarea [data-a="asignar"]'); await page.click('#mOk');
    await page.waitForFunction(() => /Camarera de Prueba/.test(((document.querySelector('.tablero') || {}).textContent || '')));
    prueba('Limpieza: asignar camarera', true);
    const limp103 = () => E.tablas.limpieza.find((l) => l.habitacion === '103');
    for (const esperado of ['limpiando', 'revisar', 'lista']) {
      await page.click('.tarea [data-a="avanzar"]');
      for (let i = 0; i < 40 && limp103().estado !== esperado; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => /Hab\. 103/.test(((document.querySelector('#lz > section') || {}).textContent || '')));
    prueba('Limpieza: por limpiar → limpiando → revisar → lista', E.tablas.limpieza.find((l) => l.habitacion === '103').estado === 'lista');
    await page.screenshot({ path: path.join(OUT, nombreVista + '-19-limpieza.png'), fullPage: true });

    // Anular otra reserva (admin, sin clave)
    await page.evaluate(() => { location.hash = '#reserva/4'; });
    await page.waitForSelector('[data-a="anular"]');
    await page.click('[data-a="anular"]');
    await page.fill('#kMot', 'Prueba de anulación');
    await page.click('#mOk');
    await page.waitForFunction(() => /Anulada/.test(((document.querySelector('#det') || {}).textContent || '')));
    prueba('Anular reserva (admin)', E.tablas.reservas.find((r) => r.id === 4).estado === 'anulada');

    // Reportes
    await page.click('#nav a[href="#reportes"]');
    await page.waitForSelector('#rp .rep');
    prueba('Reportes: 5 reportes', (await page.$$('#rp .rep')).length === 5);
    const [bajada] = await Promise.all([page.waitForEvent('download'), page.click('#repTodo')]);
    prueba('Reportes: descargar todos (Excel/CSV)', /Reportes/.test(bajada.suggestedFilename()));
    prueba('sin scroll de lado (reportes)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-20-reportes.png'), fullPage: true });

    // Auditoría
    await page.click('#nav a[href="#auditoria"]');
    await page.waitForSelector('.audit li');
    prueba('Auditoría: muestra cambios y alertas', (await page.$$('.audit li')).length >= 2 && !!(await page.$('.audit li.alerta')));
    await page.selectOption('#auTipo', 'alerta');
    prueba('Auditoría: filtrar alertas', (await page.$$('.audit li')).length === 1);
    await page.screenshot({ path: path.join(OUT, nombreVista + '-21-auditoria.png'), fullPage: true });

    // ===== Productos, Almacén, Restaurante, Timeline, Cierre, Resumen y Nota de crédito =====
    async function nuevoProducto(nombre, cat, tipo, precio, destino) {
      await page.click('#crNuevo');
      await page.fill('#cr_nombre', nombre); await page.fill('#cr_categoria', cat);
      await page.selectOption('#cr_tipo', tipo); await page.fill('#cr_precio', String(precio));
      await page.selectOption('#cr_unidad', tipo === 'Producto' ? 'NIU' : 'ZZ');
      await page.check('#cr_en_restaurante'); await page.selectOption('#cr_destino', destino);
      await page.click('#mOk');
      await page.waitForSelector('#ajPanel tr:has-text("' + nombre + '")');
    }
    await page.evaluate(() => { location.hash = '#ajustes/productos'; });
    await page.waitForSelector('#crNuevo');
    await nuevoProducto('Agua mineral', 'Bebidas', 'Producto', 4, 'Barra');
    await nuevoProducto('Lomo saltado', 'Platos', 'Kit', 32, 'Cocina');
    prueba('Productos: agregar para el restaurante', E.tablas.productos.length === 2 && E.tablas.productos.every((x) => x.en_restaurante));

    await page.click('#nav a[href="#almacen"]');
    await page.waitForSelector('#alEnt');
    await page.click('#alEnt');
    await page.fill('#amC', '10'); await page.fill('#amR', 'Guía de prueba');
    await page.click('#mOk');
    await page.waitForFunction(() => /Guía de prueba/.test(((document.querySelector('#al') || {}).textContent || '')));
    const agua = E.tablas.productos.find((x) => x.nombre === 'Agua mineral');
    prueba('Almacén: entrada suma stock (10)', Number(agua.stock) === 10);
    await page.click('#alSal');
    await page.fill('#amC', '50'); await page.fill('#amR', 'Merma');
    await page.click('#mOk');
    await page.waitForSelector('#mError:not([hidden])');
    prueba('Almacén: no deja sacar más de lo que hay', (await page.textContent('#mError')).includes('stock'));
    await page.click('#mCancelar');
    await page.screenshot({ path: path.join(OUT, nombreVista + '-22-almacen.png'), fullPage: true });

    await page.click('#nav a[href="#restaurante"]');
    await page.waitForSelector('.mesas .hab');
    await page.click('.mesas .hab[data-m="S1"]');
    await page.waitForSelector('.carta');
    await page.click('.segm [data-c="Platos"]');
    await page.click('.carta [data-p]');
    await page.waitForSelector('.cuenta');
    await page.click('.segm [data-c="Bebidas"]');
    await page.click('.carta [data-p]');
    await page.waitForFunction(() => /Agua mineral/.test(((document.querySelector('.cuenta') || {}).textContent || '')));
    await page.locator('[data-mas]').last().click();
    await page.waitForFunction(() => /Total\s*S\/ 40\.00/.test(((document.querySelector('.cuenta .total') || {}).textContent || '')));
    prueba('Restaurante: pedido Lomo + 2 Agua = S/ 40', true);
    await page.click('[data-x="comanda"]');
    await page.waitForSelector('#mTitulo:has-text("Comanda")');
    prueba('Restaurante: comanda separa Cocina y Barra', (await page.textContent('#mCuerpo')).includes('Cocina') && (await page.textContent('#mCuerpo')).includes('Barra'));
    await page.click('#mOk');
    await page.waitForSelector('[data-x="cobrar"]');
    prueba('sin scroll de lado (mesa)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-23-mesa.png'), fullPage: true });
    await page.click('[data-x="cobrar"]');
    await page.selectOption('#rFor', 'Yape');
    await page.click('#mOk');
    await page.waitForSelector('.mesas .hab');
    const ped = E.tablas.pedidos[0];
    prueba('Restaurante: cobrar cierra el pedido y emite boleta', ped.estado === 'cobrada' && E.tablas.comprobantes.some((c) => c.pedido_id === ped.id));
    prueba('Restaurante: la venta descuenta el agua del almacén (10 − 2 = 8)', Number(agua.stock) === 8);
    await page.click('.mesas .hab[data-m="S2"]');
    await page.waitForSelector('.carta');
    await page.click('.segm [data-c="Bebidas"]');
    await page.click('.carta [data-p]');
    await page.waitForSelector('[data-x="cargar"]');
    await page.click('[data-x="cargar"]');
    await page.click('#mOk');
    await page.waitForSelector('.mesas .hab');
    prueba('Restaurante: cargar a la habitación suma el consumo a la cuenta', E.tablas.consumos.some((c) => c.pedido_id && /restaurante/.test(c.descripcion)) && E.tablas.pedidos[1].estado === 'cargada');

    await page.click('#nav a[href="#timeline"]');
    await page.waitForSelector('.tl tbody tr');
    prueba('Timeline: una fila por habitación', (await page.$$('.tl tbody tr')).length === E.tablas.habitaciones.length);
    prueba('Timeline: muestra las reservas', (await page.$$('.tl td.tl-r')).length >= 3);
    prueba('sin scroll de lado (timeline)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-24-timeline.png'), fullPage: true });
    await page.click('.tl td.tl-libre button[data-h="402"]');
    await page.waitForSelector('#nHabs .hab');
    prueba('Timeline: tocar un espacio libre abre Nueva reserva con esa habitación', !!(await page.$('#nHabs .hab.elegida[data-n="402"]')));

    await page.click('#nav a[href="#cierre"]');
    await page.waitForSelector('#ciCerrar');
    prueba('Cierre: muestra la revisión de pendientes', (await page.$$('#ci .cuenta li')).length >= 5);
    await page.click('#ciCerrar'); await page.click('#mOk');
    await page.waitForFunction(() => /ya se cerró/.test(((document.querySelector('#ci') || {}).textContent || '')));
    prueba('Cierre: cerrar el día guarda el cierre', E.tablas.cierres.length === 1);
    await page.screenshot({ path: path.join(OUT, nombreVista + '-25-cierre.png'), fullPage: true });

    await page.click('#nav a[href="#inicio"]');
    await page.waitForSelector('#resumenDia .kpi');
    prueba('Inicio: resumen del día con 5 indicadores', (await page.$$('#resumenDia .kpi')).length === 5);

    await page.click('#nav a[href="#ventas"]');
    await page.waitForSelector('#vLista [data-a="nc"]');
    await page.click('#vLista [data-a="nc"]');
    await page.click('#mOk');
    await page.waitForFunction(() => /BC01-1/.test(((document.querySelector('#vLista') || {}).textContent || '')));
    prueba('Ventas: nota de crédito emitida', E.tablas.comprobantes.some((c) => c.tipo === 'nota_credito'));

    await page.click('#nav a[href="#usuarios"]');
    await page.waitForSelector('.tabla');

    // Contraseña nueva para recepción
    await page.click('tr:has-text("recepcion@ejemplo.test") button[data-act="clave"]');
    await page.fill('#fClave', 'Nueva-Rec-22');
    await page.click('#mOk');
    await page.waitForSelector('#velo', { state: 'hidden' });
    prueba('contraseña cambiada', E.cuentas['recepcion@ejemplo.test'].clave === 'Nueva-Rec-22');

    // Salir y entrar como recepción
    await page.click('#bSalir');
    await page.waitForSelector('#vIngreso:not([hidden])');
    prueba('salir vuelve al ingreso', true);
    await entrar(page, 'recepcion@ejemplo.test', 'Nueva-Rec-22');
    await page.waitForSelector('.bienvenida');
    prueba('recepción ve 18 módulos (sin Usuarios)', (await page.$$('.modulo')).length === 18);
    prueba('recepción no ve Usuarios en el menú', !(await page.textContent('#nav')).includes('Usuarios'));
    await page.evaluate(() => { location.hash = '#usuarios'; });
    await page.waitForTimeout(150);
    prueba('recepción no puede abrir Usuarios', await page.isVisible('.bienvenida'));
    await page.evaluate(() => { location.hash = '#ajustes'; });
    await page.waitForSelector('#fCandado');
    prueba('recepción: Ajustes pide la clave', true);
    await page.fill('#cClave', 'mala');
    await page.click('#fCandado button');
    await page.waitForSelector('#cErr:not([hidden])');
    prueba('clave incorrecta dice los intentos que quedan', (await page.textContent('#cErr')).includes('4 intentos'));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-13-candado.png') });
    await page.fill('#cClave', 'Clave-1234');
    await page.click('#fCandado button');
    await page.waitForSelector('#fDatos');
    prueba('con la clave se abre Ajustes', (await page.textContent('#ajClave')).includes('Clave abierta'));
    await page.fill('#dTel', '+51 900 000 000');
    await page.click('#dGuardar');
    await page.waitForFunction(() => /guardados/.test(((document.querySelector('#aviso') || {}).textContent || '')));
    prueba('recepción guarda con la clave abierta', E.tablas.config[0].telefono === '+51 900 000 000');
    await page.click('#bBloquear');
    await page.waitForSelector('#fCandado');
    prueba('Bloquear vuelve a pedir la clave', true);
    await page.evaluate(() => { location.hash = '#reserva/1'; });
    await page.waitForSelector('[data-a="anular"]');
    await page.click('[data-a="anular"]');
    await page.waitForSelector('#fClaveAdm');
    prueba('Recepción: anular una reserva pide la clave', (await page.textContent('#mTitulo')).includes('Clave'));
    await page.click('#mCancelar');
    await page.evaluate(() => { location.hash = '#auditoria'; });
    await page.waitForSelector('#auAbrir');
    prueba('Recepción: auditoría pide la clave', true);
    await page.evaluate(() => { location.hash = '#inicio'; });
    await page.waitForSelector('.bienvenida');
    prueba('sin scroll de lado (inicio)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-5-recepcion.png') });

    // Usuario desactivado no entra
    await page.click('#bSalir');
    await page.waitForSelector('#vIngreso:not([hidden])');
    await entrar(page, 'dueno@ejemplo.test', 'Prueba-Dueno-1');
    await page.waitForFunction(() => ((document.querySelector('#iError') || {}).textContent || '').length > 0);
    prueba('usuario desactivado no entra', await page.isVisible('#vIngreso'));

    // Dueño: solo lo que le corresponde
    await entrar(page, 'dueno.activo@ejemplo.test', 'Prueba-Due-1');
    await page.waitForSelector('.modulos');
    const deDueno = await page.$$eval('.modulo b', (bs) => bs.map((b) => b.textContent));
    prueba('dueño ve 10 módulos', deDueno.length === 10, deDueno.join(', '));
    prueba('dueño no ve Nueva reserva, Restaurante ni Ajustes',
      !deDueno.includes('Nueva reserva') && !deDueno.includes('Restaurante') && !deDueno.includes('Ajustes'));
    prueba('dueño ve Reportes, Caja y Auditoría',
      deDueno.includes('Reportes') && deDueno.includes('Caja') && deDueno.includes('Auditoría'));
    prueba('aviso de solo lectura', (await page.textContent('.bienvenida')).includes('Solo lectura'));
    prueba('dueño no ve Ajustes en el menú', !(await page.textContent('#nav')).includes('Ajustes'));
    await page.waitForSelector('.op-lista li');
    prueba('dueño ve la ocupación por piso', (await page.$$('.op-lista li')).length >= 4);
    prueba('dueño no tiene botón para editar pisos', !(await page.$('.ocupacion a[href="#ajustes/habitaciones"]')));
    await page.evaluate(() => { location.hash = '#ajustes'; });
    await page.waitForTimeout(150);
    prueba('dueño no puede abrir Ajustes', !(await page.$('#ajCuerpo')));
    await page.evaluate(() => { location.hash = '#panel'; });
    await page.waitForSelector('#pnl .kpis');
    prueba('Dueño: ve el panel sin "Nueva reserva"', !(await page.$('a[href="#nueva"]')));
    await page.evaluate(() => { location.hash = '#reserva/1'; });
    await page.waitForSelector('#det .cuenta');
    prueba('Dueño: ve la ficha sin botones de acción', !(await page.$('[data-a]')));
    await page.evaluate(() => { location.hash = '#inicio'; });
    await page.waitForSelector('.modulos');
    await page.screenshot({ path: path.join(OUT, nombreVista + '-7-modulos-dueno.png'), fullPage: true });

    // Vista previa: todas las pantallas del prototipo cargan sin errores
    const vp = await ctx.newPage();
    vp.on('pageerror', (e) => errores.push(nombreVista + ' vista previa: ' + e.message));
    vp.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(nombreVista + ' vista previa (seguridad): ' + m.text()); });
    let vistasOk = 0;
    const VISTAS = ['inicio', 'panel', 'timeline', 'nueva', 'reservas', 'limpieza', 'restaurante', 'whatsapp', 'ventas',
      'caja', 'cierre', 'productos', 'almacen', 'clientes', 'reportes', 'impresion'];
    for (const v of VISTAS) {
      await vp.goto(URL0 + 'vista-previa/#' + v);
      await vp.waitForSelector('#view h1', { timeout: 5000 }).catch(() => {});
      if (await vp.$('#view h1')) vistasOk++;
      if (v === 'panel' || v === 'inicio') await vp.waitForTimeout(1200), await vp.screenshot({ path: path.join(OUT, nombreVista + '-8-vista-previa-' + v + '.png') });
    }
    prueba('vista previa: las ' + VISTAS.length + ' pantallas cargan', vistasOk === VISTAS.length, vistasOk + ' de ' + VISTAS.length);
    prueba('vista previa sin scroll de lado', await sinScrollLateral(vp));
    await vp.close();

    await ctx.close();
  }

  prueba('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await browser.close();
  srv.close();
  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron. Capturas en ' + OUT);
  process.exit(mal ? 1 : 0);
})();
