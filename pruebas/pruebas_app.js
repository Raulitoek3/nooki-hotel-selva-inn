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
    clave: null, fallos: 0, esperaHasta: 0, claveHasta: {},
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
      { id: 1, habitacion: '301', entrada: diaLima(-1), salida: diaLima(1), estado: 'ocupado' },
      { id: 2, habitacion: '302', entrada: diaLima(-2), salida: diaLima(2), estado: 'ocupado' },
      { id: 3, habitacion: '101', entrada: diaLima(0), salida: diaLima(2), estado: 'ocupado' },
      { id: 4, habitacion: '201', entrada: diaLima(0), salida: diaLima(1), estado: 'confirmado' },
      { id: 5, habitacion: '102', entrada: diaLima(-5), salida: diaLima(-3), estado: 'finalizada' }
    ]
  };
}
const LLAVE = { config: 'id', tipos_habitacion: 'codigo', habitaciones: 'numero', reservas: 'id' };
const AJUSTES = ['config', 'tipos_habitacion', 'habitaciones'];
const UNICOS = { tipos_habitacion: ['codigo', 'nombre'], habitaciones: ['numero'] };
const REFERENCIAS = { habitaciones: [['reservas', 'habitacion', 'numero']], tipos_habitacion: [['habitaciones', 'tipo', 'codigo']] };

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
    if (op === 'in') { const lista = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); if (!lista.includes(a)) return false; }
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
      const puede = yoU && (!AJUSTES.includes(t) || claveAbierta());
      if (metodo === 'GET') {
        const sel = yoU ? ordenar(filas.filter((f) => cumpleFiltros(f, url.searchParams)), url.searchParams.get('order')) : [];
        if (objeto) return sel.length ? json(sel[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
        return json(sel);
      }
      if (metodo === 'POST') {
        if (!puede) return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
        let nuevas = req.postDataJSON(); if (!Array.isArray(nuevas)) nuevas = [nuevas];
        for (const n of nuevas) for (const u of (UNICOS[t] || [])) {
          if (filas.some((f) => f[u] === n[u]) || nuevas.filter((x) => x[u] === n[u]).length > 1) return json({ code: '23505', message: 'duplicate key' }, 409);
        }
        nuevas.forEach((n) => filas.push(Object.assign({ fuera_de_venta: false, notas: null, activo: true }, n)));
        return representar ? json(nuevas, 201) : route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      const afectadas = puede ? filas.filter((f) => cumpleFiltros(f, url.searchParams)) : [];
      if (metodo === 'PATCH') {
        const cambios = req.postDataJSON();
        for (const u of (UNICOS[t] || [])) if (cambios[u] != null && filas.some((f) => f[u] === cambios[u] && !afectadas.includes(f))) return json({ code: '23505', message: 'duplicate key' }, 409);
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
    await page.waitForFunction(() => document.querySelector('#iError').textContent.includes('no tiene acceso'));
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
    await page.waitForFunction(() => /Desactivado/.test(document.querySelector('.tabla tbody tr:last-child').textContent));
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
    prueba('Panel abre la vista previa en otra pestaña',
      (await page.getAttribute('.modulo[href="/vista-previa/#panel"]', 'target')) === '_blank');
    prueba('sin scroll de lado (módulos)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-6-modulos-admin.png'), fullPage: true });

    // Clic en un módulo: abre la vista previa con esa pantalla
    const [pv] = await Promise.all([ctx.waitForEvent('page'), page.click('.modulo[href="/vista-previa/#reportes"]')]);
    pv.on('pageerror', (e) => errores.push(nombreVista + ' vista previa: ' + e.message));
    await pv.waitForSelector('#view h1');
    prueba('el enlace abre Reportes en la vista previa', (await pv.textContent('#view h1')).includes('Reportes'));
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
    prueba('Ajustes tiene 4 secciones', (await page.$$('.tabs [role=tab]')).length === 4);
    prueba('los datos del hotel vienen de la base', (await page.inputValue('#dNombre')) === 'Hotel Selva Inn' && (await page.inputValue('#dTel')) === '+51 946 895 818');
    prueba('Amazonía marcada y sin campo de IGV', (await page.isChecked('#dAmaz')) && (await page.isHidden('#dIgvCaja')));
    await page.fill('#dRuc', '123');
    await page.click('#dGuardar');
    await page.waitForSelector('#dErr:not([hidden])');
    prueba('RUC inválido avisa', (await page.textContent('#dErr')).includes('11 números'));
    await page.fill('#dRuc', '20999999999');
    await page.fill('#dRazon', 'Empresa de Prueba S.A.C.');
    await page.click('#dGuardar');
    await page.waitForFunction(() => /guardados/.test(document.querySelector('#aviso').textContent));
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
    await page.waitForFunction(() => /Clave creada/.test(document.querySelector('#aviso').textContent));
    prueba('crear la clave de administrador', E.clave === 'Clave-1234');

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
    await page.waitForFunction(() => /guardados/.test(document.querySelector('#aviso').textContent));
    prueba('recepción guarda con la clave abierta', E.tablas.config[0].telefono === '+51 900 000 000');
    await page.click('#bBloquear');
    await page.waitForSelector('#fCandado');
    prueba('Bloquear vuelve a pedir la clave', true);
    await page.evaluate(() => { location.hash = '#inicio'; });
    await page.waitForSelector('.bienvenida');
    prueba('sin scroll de lado (inicio)', await sinScrollLateral(page));
    await page.screenshot({ path: path.join(OUT, nombreVista + '-5-recepcion.png') });

    // Usuario desactivado no entra
    await page.click('#bSalir');
    await page.waitForSelector('#vIngreso:not([hidden])');
    await entrar(page, 'dueno@ejemplo.test', 'Prueba-Dueno-1');
    await page.waitForFunction(() => document.querySelector('#iError').textContent.length > 0);
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
