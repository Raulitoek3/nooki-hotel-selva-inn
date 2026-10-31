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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
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
      { id: 'u-admin', nombre: 'Nooki (administrador)', correo: 'oficinavirtual@nooki.pe', rol: 'admin', activo: true, creado_en: '2026-10-31T19:00:00Z', ultimo_ingreso: '2026-10-31T19:30:00Z' },
      { id: 'u-rec', nombre: 'Recepción de prueba', correo: 'recepcion@ejemplo.test', rol: 'recepcion', activo: true, creado_en: '2026-10-31T19:05:00Z', ultimo_ingreso: null },
      { id: 'u-due', nombre: 'Dueño de prueba', correo: 'dueno.activo@ejemplo.test', rol: 'dueno', activo: true, creado_en: '2026-10-31T19:06:00Z', ultimo_ingreso: null }
    ],
    llamadas: []
  };
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
