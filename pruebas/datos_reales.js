/* ====== DATOS REALES DEL HOTEL (Supabase) ======
   Lo inserta pruebas/generar_sistema.py justo antes del arranque del prototipo.
   Reemplaza los datos de ejemplo por los de window.DATOS_HOTEL (los carga app/puente.js). */
(function () {
  var D = window.DATOS_HOTEL; if (!D) return;
  var DOC = { '1': 'DNI', '4': 'Carné de extranjería', '7': 'Pasaporte', '6': 'RUC', '0': 'Sin documento' };
  var cfg = D.config || {};
  function isoLima(t) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(t); }
  function hhmm(t) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(t); }
  function hora(x, porDefecto) { return x ? String(x).slice(0, 5) : porDefecto; }

  TODAY = fromIso(D.hoy); NOW_H = D.hora;

  TYPES = {}; TYPE_ORDER = [];
  D.tipos.forEach(function (t) { TYPES[t.codigo] = { n: t.nombre, rate: Number(t.tarifa), beds: t.camas, cap: t.capacidad }; TYPE_ORDER.push(t.codigo); });

  var pers = {}; D.personal.forEach(function (p) { pers[p.id] = p.nombre; });
  var limp = {}; D.limpieza.forEach(function (l) { limp[l.habitacion] = l; });
  ROOMS = D.habitaciones.slice().sort(function (a, b) { return a.piso - b.piso || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }); })
    .map(function (h) { return { n: h.numero, t: h.tipo, f: h.piso, off: !!h.fuera_de_venta, cleaning: !!limp[h.numero] }; });
  HK = {}; HKDONE = []; REPASO = {};
  D.limpieza.forEach(function (l) { HK[l.habitacion] = { st: l.estado, who: pers[l.personal_id] || '', since: hhmm(new Date(l.desde)), kind: l.tipo }; });

  var cli = {}; D.clientes.forEach(function (c) { cli[c.id] = c; });
  var comp = {}; D.comprobantes.forEach(function (c) { comp[c.id] = c; });
  RES = D.reservas.filter(function (r) { return r.estado !== 'no_show'; }).map(function (r) {
    var c = cli[r.cliente_id] || {}, e = cli[r.empresa_id];
    return { id: r.id, group: r.grupo_id || r.id, room: r.habitacion,
      guest: { name: c.nombre || 'Sin nombre', doc: c.num_doc || '', docType: DOC[c.tipo_doc] || 'DNI', nat: c.nacionalidad || 'Perú' },
      company: e ? { name: e.nombre, ruc: e.num_doc } : null, origin: r.origen || 'Directo', ext: r.codigo_externo || '', motivo: r.motivo || '',
      ref: 'Ninguna', ci: fromIso(r.entrada), co: fromIso(r.salida), rate: Number(r.tarifa), tarifa: r.tarifa_nombre || 'Regular',
      persons: r.personas, state: r.estado, items: [], pays: [], notes: [], extra: [], log: [] };
  });
  var porId = {}; RES.forEach(function (r) { porId[r.id] = r; });
  D.consumos.forEach(function (x) { var r = porId[x.reserva_id]; if (r) r.items.push({ n: x.descripcion, p: Number(x.precio), q: Number(x.cantidad) }); });
  PID = 0;
  D.pagos.forEach(function (p) {
    var r = porId[p.reserva_id]; if (!r) return;
    var cp = comp[p.comprobante_id] || {}, t = new Date(p.creado_en);
    r.pays.push({ id: p.id, r: r, doc: cp.numero_completo || '', method: p.forma_pago, amount: Number(p.monto),
      kind: { boleta: 'Boleta', factura: 'Factura', nota_venta: 'Nota de venta' }[cp.tipo] || 'Boleta',
      d: fromIso(isoLima(t)), h: hhmm(t), sunat: cp.estado || 'pendiente', anulado: !!p.anulado });
    if (p.id > PID) PID = p.id;
  });
  nid = RES.reduce(function (m, r) { return Math.max(m, r.id); }, 0);

  PRODUCTS = D.productos.map(function (p) {
    var precio = Number(p.precio), l = p.precios || {};
    return { id: p.id, n: p.nombre, c: p.categoria, p: precio, t: p.tipo, cost: p.costo != null ? Number(p.costo) : null,
      stock: p.tipo === 'Producto' ? Number(p.stock || 0) : null, min: p.stock_minimo != null ? Number(p.stock_minimo) : 0,
      lot: p.lote || '', exp: p.vence || '', rest: !!p.en_restaurante, dest: p.destino || '', ant: 15, on: p.activo !== false,
      prices: { publico: l.publico != null ? Number(l.publico) : precio, booking: l.booking != null ? Number(l.booking) : precio,
        personal: l.personal != null ? Number(l.personal) : precio, promo: l.promo != null ? Number(l.promo) : precio } };
  });
  STOCKMOV = [];
  EMP = D.personal.map(function (p) { return { name: p.nombre, cargo: p.cargo, turno: p.turno || '', on: p.activo !== false }; });
  STAFF = EMP.filter(function (e) { return e.on; }).map(function (e) { return e.name; });
  SEASONS = D.temporadas.map(function (s) { return { n: s.nombre, from: s.desde, to: s.hasta, pct: Number(s.porcentaje) }; });
  WEEKEND = { on: !!cfg.fin_semana_activo, pct: Number(cfg.fin_semana_pct || 0) };
  if (D.origenes.length) ORIGINS = D.origenes.filter(function (o) { return o.activo !== false; }).map(function (o) { return { n: o.nombre, c: Number(o.comision_pct || 0) }; });
  if (D.formas.length) { METHODS = D.formas.map(function (f) { return f.nombre; }); PAYON = {}; METHODS.forEach(function (m) { PAYON[m] = true; }); }
  if (D.motivos.length) MOTIVOS = D.motivos.map(function (m) { return m.nombre; });
  if (D.mesas.length) {
    AMB = D.mesas.map(function (m) { return m.ambiente; }).filter(function (a, i, x) { return x.indexOf(a) === i; });
    TABLES = D.mesas.map(function (m) { return { id: m.id, n: m.nombre, amb: m.ambiente, seats: m.asientos, order: null }; });
    state.amb = AMB[0];
  }
  TURNOS = []; CIERRES = []; WA = []; EXTRA = []; AUD = []; CLI_EXTRA = [];
  NOGRATO = {}; D.noGratos.forEach(function (c) { if (c.num_doc) NOGRATO[c.num_doc] = { motivo: c.motivo_no_grato || '', d: TODAY }; });

  CFG.name = cfg.nombre_comercial || CFG.name; CFG.legal = cfg.razon_social || ''; CFG.ruc = cfg.ruc || '';
  CFG.addr = cfg.direccion || ''; CFG.phone = cfg.telefono || ''; CFG.mail = cfg.correo || '';
  CFG.igv = Number(cfg.igv_pct != null ? cfg.igv_pct : CFG.igv); CFG.amazonia = !!cfg.amazonia;
  CFG.ci = hora(cfg.hora_checkin, CFG.ci); CFG.co = hora(cfg.hora_checkout, CFG.co); CFG.maxco = hora(cfg.hora_max_checkout, CFG.maxco);
  CFG.env = cfg.ambiente_nooki === 'produccion' ? 'Producción' : 'Beta';

  state.caja = !!D.caja;
  if (D.caja) { state.cajaSince = hhmm(new Date(D.caja.abierto_en)); state.cajaOpenAmt = Number(D.caja.monto_inicial || 0); }
})();

/* Nombre del usuario que entró */
function ME() { return (window.PUENTE && PUENTE.nombre) || 'Recepción'; }

/* Clave de administrador: se verifica en el servidor, no en el navegador */
function pedirClave(motivo, fn) {
  if (adminActivo()) { renovarAdmin(); fn(); return; }
  openModal({ title: 'Clave de administrador', width: 400,
    body: '<p>' + esc(motivo) + ' necesita la clave de administrador.</p><div class="field"><label for="admPin2">Clave</label><input id="admPin2" type="password" autocomplete="off" placeholder="••••"></div><p class="ferr" id="admE2" hidden></p><p class="hint">Queda abierto ' + ADM.MIN + ' minutos.</p>',
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="admGo">' + ic('login') + 'Continuar</button>',
    onMount: function (w) {
      var inp = $('#admPin2', w), e = $('#admE2', w);
      var go2 = function () {
        PUENTE.clave(inp.value.trim()).then(function (r) {
          if (r && r.ok) { closeModal(true); renovarAdmin(); actualizarAdmChip(); fn(); return; }
          e.textContent = { incorrecta: 'Clave incorrecta. Te quedan ' + (r && r.intentos_restantes) + ' intentos.', espera: 'Demasiados intentos. Espera 1 minuto.',
            sin_clave: 'Todavía no hay clave de administrador. Créala en Ajustes.', sin_permiso: 'Tu cuenta no puede hacer esto.' }[r && r.motivo] || 'No se pudo verificar la clave.';
          e.hidden = false; inp.value = ''; inp.focus();
        }, function () { e.textContent = 'Sin conexión: no se pudo verificar la clave.'; e.hidden = false; });
      };
      $('#admGo', w).onclick = go2; inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go2(); });
    } });
}

/* El administrador (Nooki) nunca necesita la clave */
function adminActivo() { return (window.PUENTE && PUENTE.rol === 'admin') || Date.now() < ADM.hasta; }
function actualizarAdmChip() {
  var b = $('#admChip'); if (!b) return;
  if (PUENTE.rol === 'admin') { b.hidden = true; return; }   // sin contador para el administrador
  var on = Date.now() < ADM.hasta; b.hidden = !on;
  if (on) { var s = Math.max(0, Math.round((ADM.hasta - Date.now()) / 1000)); b.innerHTML = ic('login') + '<span>Administrador · ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + '</span><b>Bloquear</b>'; b.setAttribute('aria-label', 'Modo administrador abierto. Tocar para bloquear'); }
}

/* Menú del usuario: nombre real, tema, Usuarios y facturación (sistema anterior) y Salir */
Object.assign(ACT, {
  'me': function (a) {
    var items = [{ head: ME() + ' · ' + CFG.name },
      { label: effTheme() === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro', icon: effTheme() === 'dark' ? 'sun' : 'moon', run: toggleTheme }];
    if (PUENTE.rol === 'admin') items.push({ label: 'Usuarios y conexión con el facturador', icon: 'search', run: function () { location.href = '/anterior.html#usuarios'; } });
    items.push({ label: 'Salir', icon: 'login', run: PUENTE.salir });
    menu(a, items, { width: 280 });
  }
});
(function () {
  var b = document.querySelector('.me b'), s = document.querySelector('.me small'), av = document.querySelector('.me .av');
  var roles = { admin: 'Administrador', recepcion: 'Recepción', dueno: 'Dueño' };
  if (b) b.textContent = ME();
  if (s) s.textContent = roles[PUENTE.rol] || '';
  if (av) av.textContent = ME().replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase();
})();

/* ====== GUARDAR EN LA BASE ======
   El prototipo cambia los datos en memoria y luego llama a refresh()/render().
   Después de cada uno, sincronizar() compara con lo último guardado y graba solo las diferencias. */
var SYNC = { cola: Promise.resolve(), turno: (window.DATOS_HOTEL && DATOS_HOTEL.caja) ? DATOS_HOTEL.caja.id : null };
(function prepararFotos() {
  var D = window.DATOS_HOTEL; if (!D) return;
  var cliDb = {}; D.clientes.forEach(function (c) { cliDb[c.id] = c; });
  var resDb = {}; D.reservas.forEach(function (r) { resDb[r.id] = r; });
  var consDb = {}; D.consumos.forEach(function (x) { (consDb[x.reserva_id] = consDb[x.reserva_id] || []).push(x); });
  RES.forEach(function (r) {
    var db = resDb[r.id]; r._db = true;
    if (db) { r.guest._cli = db.cliente_id; if (r.company) r.company._cli = db.empresa_id; }
    r._s = foto(r);
    r._it = {}; (consDb[r.id] || []).forEach(function (x) { r._it[x.descripcion] = { id: x.id, q: Number(x.cantidad) }; });
    r.pays.forEach(function (p) { p._db = true; p._anulado = p.anulado; });
  });
  SYNC.hk = {}; D.limpieza.forEach(function (l) { SYNC.hk[l.habitacion] = { id: l.id, st: l.estado, who: HK[l.habitacion] ? HK[l.habitacion].who : '' }; });
  SYNC.caja = !!D.caja;
  SYNC.cfg = JSON.stringify(cfgFoto());
  SYNC.tipos = JSON.stringify(TYPES); SYNC.rooms = JSON.stringify(ROOMS.map(roomFoto));
  SYNC.seasons = JSON.stringify(SEASONS); SYNC.emp = JSON.stringify(EMP); SYNC.prods = JSON.stringify(PRODUCTS.map(prodFoto));
  SYNC.perId = {}; D.personal.forEach(function (p) { SYNC.perId[p.nombre] = p.id; });
  SYNC.prodId = {}; D.productos.forEach(function (p) { SYNC.prodId[p.nombre] = p.id; });
  SYNC.tempId = D.temporadas.map(function (s) { return s.id; });
})();
function foto(r) { return { state: r.state, rate: Number(r.rate), ci: r.ci, co: r.co, room: r.room, persons: r.persons }; }
function roomFoto(h) { return { n: h.n, t: h.t, f: h.f, off: !!h.off }; }
function prodFoto(p) { return { n: p.n, c: p.c, p: p.p, t: p.t, min: p.min, rest: !!p.rest, dest: p.dest || '', on: p.on !== false }; }
function cfgFoto() { return { n: CFG.name, l: CFG.legal, r: CFG.ruc, a: CFG.addr, p: CFG.phone, m: CFG.mail, i: CFG.igv, z: !!CFG.amazonia, ci: CFG.ci, co: CFG.co, mx: CFG.maxco, w: WEEKEND.on, wp: WEEKEND.pct }; }

var DOC_COD = { 'DNI': '1', 'Carné de extranjería': '4', 'Pasaporte': '7', 'RUC': '6', 'Sin documento': '0' };
function db(promesa) { return promesa.then(function (r) { if (r.error) throw r.error; return r.data; }); }
function avisoError(que, e) {
  var c = e && e.code, m = c === '23P01' ? 'esa habitación ya está ocupada en esas fechas' : c === '23505' ? 'ya existe' : c === '42501' ? 'falta la clave de administrador' :
    c === '23503' ? 'está en uso' : c === '23514' ? 'algún dato no es válido' : /fetch|network/i.test(String(e && e.message)) ? 'sin conexión a internet' : (e && (e.mensaje || e.message)) || 'error';
  toast('No se guardó ' + que + ': ' + m + '.', { icon: 'alert' });
}
function enCola(fn) { SYNC.cola = SYNC.cola.then(fn).catch(function () {}); return SYNC.cola; }

function asegurarCliente(g) {
  if (!g) return Promise.resolve(null);
  if (g._cli) return Promise.resolve(g._cli);
  var td = DOC_COD[g.docType] || (g.ruc ? '6' : '1'), doc = g.doc || g.ruc || null, nombre = g.name;
  var buscar = doc ? db(PUENTE.sb.from('clientes').select('id').eq('tipo_doc', td).eq('num_doc', doc)) : Promise.resolve([]);
  return buscar.then(function (f) {
    if (f.length) return (g._cli = f[0].id);
    return db(PUENTE.sb.from('clientes').insert({ tipo_doc: doc ? td : '0', num_doc: doc, nombre: nombre || 'Sin nombre', nacionalidad: g.nat || 'Perú', telefono: g.phone || null }).select('id'))
      .then(function (n) { return (g._cli = n[0].id); });
  });
}

function guardarReserva(r) {
  if (r._guardando) return; r._guardando = true;
  enCola(function () {
    return Promise.all([asegurarCliente(r.guest), r.company ? asegurarCliente({ name: r.company.name, ruc: r.company.ruc, docType: 'RUC', doc: r.company.ruc, _cli: r.company._cli }) : null]).then(function (ids) {
      if (r.company) r.company._cli = ids[1];
      var nota = r.notes && r.notes[0] && (r.notes[0].text || r.notes[0].t);
      return db(PUENTE.sb.from('reservas').insert({ habitacion: r.room, cliente_id: ids[0], empresa_id: ids[1] || null, origen: r.origin || null, codigo_externo: r.ext || null,
        motivo: r.motivo || null, entrada: iso(r.ci), salida: iso(r.co), tarifa: Number(r.rate), tarifa_nombre: r.tarifa || 'Regular', personas: r.persons || 1,
        estado: r.state, notas: nota || null }).select('id'));
    }).then(function (f) {
      var viejo = r.id; r.id = f[0].id; r._db = true; r._s = foto(r); r._it = r._it || {};
      if (state.dw && state.dw.resId === viejo) state.dw.resId = r.id;
      if (r.group === viejo) RES.forEach(function (x) { if (x.group === viejo) x.group = r.id; });
      nid = Math.max(nid, r.id);
    }).catch(function (e) {
      avisoError('la reserva de la ' + rname(r.room), e);
      var i = RES.indexOf(r); if (i >= 0) RES.splice(i, 1);
      refreshBase();
    }).then(function () { r._guardando = false; refreshBase(); });
  });
}

function cambiosReserva(r) {
  var s = r._s, c = {};
  if (r.state !== s.state) {
    c.estado = r.state;
    if (r.state === 'ocupado') c.checkin_en = new Date().toISOString();
    if (r.state === 'finalizada') { c.checkout_en = new Date().toISOString(); if (r.co > TODAY) { r.co = Math.max(TODAY, r.ci + 1); } }
    if (r.state === 'anulada') { var l = r.log.filter(function (x) { return /anulada/i.test(x.text || ''); }).pop(); c.motivo_anulacion = l ? String(l.text).replace(/^.*?·\s*/, '') : 'Anulada'; }
  }
  if (Number(r.rate) !== s.rate) { c.tarifa = Number(r.rate); c.tarifa_nombre = 'Precio especial'; }
  if (r.ci !== s.ci) c.entrada = iso(r.ci);
  if (r.co !== s.co) c.salida = iso(r.co);
  if (r.room !== s.room) c.habitacion = r.room;
  if (r.persons !== s.persons) c.personas = r.persons;
  if (!Object.keys(c).length) return;
  var antes = s; r._s = foto(r);
  enCola(function () {
    return db(PUENTE.sb.from('reservas').update(c).eq('id', r.id).select('id')).then(function (f) {
      if (!f.length) throw { code: '42501' };
    }).catch(function (e) { avisoError('el cambio de la reserva #' + r.id, e); r._s = antes; });
  });
}

function cambiosConsumos(r) {
  var vivos = {};
  r.items.forEach(function (it) { vivos[it.n] = (vivos[it.n] || 0) + Number(it.q); });
  Object.keys(vivos).forEach(function (n) {
    var prev = r._it[n], q = vivos[n], it = r.items.filter(function (x) { return x.n === n; })[0];
    if (!prev) {
      r._it[n] = { id: null, q: q };
      var pr = PROD(n);
      enCola(function () {
        return db(PUENTE.sb.from('consumos').insert({ reserva_id: r.id, producto_id: SYNC.prodId[n] || null, descripcion: n, cantidad: q, precio: Number(it.p), unidad: pr && pr.t === 'Producto' ? 'NIU' : 'ZZ' }).select('id'))
          .then(function (f) { r._it[n].id = f[0].id; }).catch(function (e) { delete r._it[n]; avisoError('el consumo ' + n, e); });
      });
    } else if (prev.q !== q && prev.id) {
      prev.q = q;
      enCola(function () { return db(PUENTE.sb.from('consumos').update({ cantidad: q }).eq('id', prev.id).select('id')).catch(function (e) { avisoError('el consumo ' + n, e); }); });
    }
  });
  Object.keys(r._it).forEach(function (n) {
    if (vivos[n] == null && r._it[n].id) {
      var id = r._it[n].id; delete r._it[n];
      enCola(function () { return db(PUENTE.sb.from('consumos').update({ anulado: true }).eq('id', id).select('id')).catch(function (e) { avisoError('quitar el consumo ' + n, e); }); });
    }
  });
}

var TIPO_COMP = { 'Boleta': 'boleta', 'Factura': 'factura', 'Nota de venta': 'nota_venta' };
function facturar(cuerpo) {
  return PUENTE.sb.functions.invoke('facturar', { body: cuerpo }).then(function (r) {
    if (!r.error) return r.data;
    var ctx = r.error.context;
    return (ctx && ctx.json ? ctx.json() : Promise.resolve(null)).then(function (j) { throw { mensaje: (j && j.error && j.error.mensaje) || 'el facturador no respondió' }; });
  });
}
function cambiosPagos(r) {
  r.pays.forEach(function (p) {
    if (!p._db && !p._guardando) {
      p._guardando = true;
      enCola(function () {
        var cli = p.kind === 'Factura' && r.company ? { tipo_doc: '6', num_doc: r.company.ruc, nombre: r.company.name }
          : r.guest && r.guest.doc ? { tipo_doc: DOC_COD[r.guest.docType] || '1', num_doc: r.guest.doc, nombre: r.guest.name } : { tipo_doc: '0', num_doc: null, nombre: (r.guest && r.guest.name) || 'Clientes varios' };
        return db(PUENTE.sb.from('pagos').insert({ reserva_id: r.id, turno_id: SYNC.turno, forma_pago: p.method, monto: Number(p.amount),
          tipo: r.state === 'ocupado' || r.state === 'finalizada' ? 'pago' : 'adelanto' }).select('id')).then(function (f) {
          p._db = true; p._id = f[0].id; p.doc = 'Emitiendo…'; p.sunat = p.kind === 'Nota de venta' ? 'interno' : 'pendiente'; refreshBase();
          return facturar({ accion: 'emitir', pago_id: p._id, tipo: TIPO_COMP[p.kind] || 'boleta', cliente: cli }).then(function (x) {
            var c = x.comprobante || {}; p.doc = c.numero_completo || c.serie || ''; p.sunat = c.estado || 'pendiente'; p._comp = c.id;
            toast(c.estado === 'aceptado' || c.estado === 'observado' ? 'SUNAT aceptó la ' + p.kind.toLowerCase() + ' ' + p.doc
              : c.estado === 'interno' ? 'Nota de venta ' + p.doc : 'Comprobante ' + p.doc + ': ' + (c.mensaje_sunat || c.estado), { icon: c.estado === 'error' ? 'alert' : undefined });
          }, function (e) { p.doc = 'Sin comprobante'; p.sunat = 'error'; avisoError('el comprobante (el pago sí quedó guardado)', e); });
        }).catch(function (e) { if (!p._db) { avisoError('el pago de ' + money(p.amount), e); var i = r.pays.indexOf(p); if (i >= 0) r.pays.splice(i, 1); } })
          .then(function () { p._guardando = false; refreshBase(); });
      });
    } else if (p._db && p.anulado && !p._anulado && p._comp) {
      p._anulado = true;
      enCola(function () { return facturar({ accion: 'anular', comprobante_id: p._comp, motivo: 'Anulado desde recepción' }).then(function () { toast('Anulación enviada a SUNAT: ' + p.doc); }, function (e) { avisoError('la anulación en SUNAT', e); }); });
    }
  });
}

function cambiosLimpieza() {
  var previo = SYNC.hk, ahora = {};
  Object.keys(HK).forEach(function (n) { ahora[n] = HK[n]; });
  Object.keys(ahora).forEach(function (n) {
    var h = ahora[n], p = previo[n], est = h.st === 'sucia' || h.st === 'limpiando' || h.st === 'revisar' ? h.st : 'sucia';
    if (!p) {
      previo[n] = { id: null, st: est, who: h.who };
      enCola(function () {
        return db(PUENTE.sb.from('limpieza').insert({ habitacion: n, tipo: h.kind || 'Salida', estado: est, personal_id: SYNC.perId[h.who] || null }).select('id'))
          .then(function (f) { previo[n].id = f[0].id; }, function (e) { if (e && e.code === '23505') return; avisoError('la limpieza de la ' + n, e); });
      });
    } else if ((p.st !== est || p.who !== h.who) && p.id) {
      p.st = est; p.who = h.who;
      enCola(function () { return db(PUENTE.sb.from('limpieza').update({ estado: est, personal_id: SYNC.perId[h.who] || null }).eq('id', p.id).select('id')).catch(function (e) { avisoError('la limpieza de la ' + n, e); }); });
    }
  });
  Object.keys(previo).forEach(function (n) {
    if (!ahora[n] && previo[n].id) {
      var id = previo[n].id; delete previo[n];
      enCola(function () { return db(PUENTE.sb.from('limpieza').update({ estado: 'lista', terminado_en: new Date().toISOString() }).eq('id', id).select('id')).catch(function (e) { avisoError('la limpieza de la ' + n, e); }); });
    }
  });
}

function cambiosCaja() {
  if (state.caja === SYNC.caja) return;
  SYNC.caja = state.caja;
  if (state.caja) {
    enCola(function () {
      return db(PUENTE.sb.from('caja_turnos').insert({ responsable: ME(), monto_inicial: Number(state.cajaOpenAmt || 0) }).select('id'))
        .then(function (f) { SYNC.turno = f[0].id; }, function (e) { avisoError('la apertura de caja', e); });
    });
  } else if (SYNC.turno) {
    var id = SYNC.turno; SYNC.turno = null;
    enCola(function () { return db(PUENTE.sb.from('caja_turnos').update({ cerrado_en: new Date().toISOString(), notas: 'Cerrada en recepción' }).eq('id', id).select('id')).catch(function (e) { avisoError('el cierre de caja', e); }); });
  }
}

function cambiosAjustes() {
  var c = JSON.stringify(cfgFoto());
  if (c !== SYNC.cfg) {
    SYNC.cfg = c;
    enCola(function () {
      var d = { nombre_comercial: CFG.name, razon_social: CFG.legal || null, ruc: CFG.ruc || null, direccion: CFG.addr || null, telefono: CFG.phone || null, correo: CFG.mail || null,
        amazonia: !!CFG.amazonia, hora_checkin: CFG.ci, hora_checkout: CFG.co, hora_max_checkout: CFG.maxco, fin_semana_activo: !!WEEKEND.on, fin_semana_pct: Number(WEEKEND.pct || 0) };
      if (!CFG.amazonia) d.igv_pct = Number(CFG.igv);
      return db(PUENTE.sb.from('config').update(d).eq('id', 1).select('id')).then(function (f) { if (!f.length) throw { code: '42501' }; }).catch(function (e) { avisoError('los datos del hotel', e); });
    });
  }
  var t = JSON.stringify(TYPES);
  if (t !== SYNC.tipos) {
    var antes = JSON.parse(SYNC.tipos); SYNC.tipos = t;
    Object.keys(TYPES).forEach(function (k, i) {
      var x = TYPES[k], d = { nombre: x.n, tarifa: Number(x.rate), camas: Number(x.beds || 0), capacidad: Number(x.cap || 1) };
      if (!antes[k]) enCola(function () { return db(PUENTE.sb.from('tipos_habitacion').insert(Object.assign({ codigo: k, orden: i + 1 }, d)).select('codigo')).catch(function (e) { avisoError('el tipo ' + x.n, e); }); });
      else if (JSON.stringify(antes[k]) !== JSON.stringify(x)) enCola(function () { return db(PUENTE.sb.from('tipos_habitacion').update(d).eq('codigo', k).select('codigo')).catch(function (e) { avisoError('el tipo ' + x.n, e); }); });
    });
    Object.keys(antes).forEach(function (k) { if (!TYPES[k]) enCola(function () { return db(PUENTE.sb.from('tipos_habitacion').delete().eq('codigo', k).select('codigo')).catch(function (e) { avisoError('eliminar el tipo', e); }); }); });
  }
  var rr = JSON.stringify(ROOMS.map(roomFoto));
  if (rr !== SYNC.rooms) {
    var prev = {}; JSON.parse(SYNC.rooms).forEach(function (h) { prev[h.n] = h; }); SYNC.rooms = rr;
    var ahora = {}; ROOMS.forEach(function (h) { ahora[h.n] = roomFoto(h); });
    Object.keys(ahora).forEach(function (n) {
      var h = ahora[n], d = { tipo: h.t, piso: Number(h.f) || 0, fuera_de_venta: h.off };
      if (!prev[n]) enCola(function () { return db(PUENTE.sb.from('habitaciones').insert(Object.assign({ numero: n }, d)).select('numero')).catch(function (e) { avisoError('la habitación ' + n, e); }); });
      else if (JSON.stringify(prev[n]) !== JSON.stringify(h)) enCola(function () { return db(PUENTE.sb.from('habitaciones').update(d).eq('numero', n).select('numero')).catch(function (e) { avisoError('la habitación ' + n, e); }); });
    });
    Object.keys(prev).forEach(function (n) { if (!ahora[n]) enCola(function () { return db(PUENTE.sb.from('habitaciones').delete().eq('numero', n).select('numero')).catch(function (e) { avisoError('eliminar la habitación ' + n, e); }); }); });
  }
  var ss = JSON.stringify(SEASONS);
  if (ss !== SYNC.seasons) {
    SYNC.seasons = ss;
    var ids = SYNC.tempId.slice();
    enCola(function () {
      return (ids.length ? db(PUENTE.sb.from('temporadas').delete().in('id', ids).select('id')) : Promise.resolve()).then(function () {
        return SEASONS.length ? db(PUENTE.sb.from('temporadas').insert(SEASONS.map(function (s) { return { nombre: s.n, desde: s.from, hasta: s.to, porcentaje: Number(s.pct) }; })).select('id')) : [];
      }).then(function (f) { SYNC.tempId = (f || []).map(function (x) { return x.id; }); }).catch(function (e) { avisoError('las temporadas', e); });
    });
  }
  var ee = JSON.stringify(EMP);
  if (ee !== SYNC.emp) {
    SYNC.emp = ee;
    EMP.forEach(function (p) {
      var id = SYNC.perId[p.name], d = { nombre: p.name, cargo: p.cargo || 'Personal', turno: p.turno || null, activo: p.on !== false };
      if (!id) enCola(function () { return db(PUENTE.sb.from('personal').insert(d).select('id')).then(function (f) { SYNC.perId[p.name] = f[0].id; }).catch(function (e) { avisoError(p.name, e); }); });
      else enCola(function () { return db(PUENTE.sb.from('personal').update(d).eq('id', id).select('id')).catch(function () {}); });
    });
  }
  var pp = JSON.stringify(PRODUCTS.map(prodFoto));
  if (pp !== SYNC.prods) {
    SYNC.prods = pp;
    PRODUCTS.forEach(function (p) {
      var id = SYNC.prodId[p.n], d = { nombre: p.n, categoria: p.c || 'General', tipo: p.t || 'Servicio', precio: Number(p.p), stock_minimo: p.t === 'Producto' ? Number(p.min || 0) : null,
        en_restaurante: !!p.rest, destino: p.dest || null, unidad: p.t === 'Producto' ? 'NIU' : 'ZZ', activo: p.on !== false };
      if (!id) enCola(function () { return db(PUENTE.sb.from('productos').insert(d).select('id')).then(function (f) { SYNC.prodId[p.n] = f[0].id; }).catch(function (e) { avisoError('el producto ' + p.n, e); }); });
      else enCola(function () { return db(PUENTE.sb.from('productos').update(d).eq('id', id).select('id')).catch(function () {}); });
    });
  }
}

function cambiosStock() {
  STOCKMOV.forEach(function (m) {
    if (m._db) return; m._db = true;
    var id = SYNC.prodId[m.prod]; if (!id) return;
    enCola(function () { return db(PUENTE.sb.from('movimientos_stock').insert({ producto_id: id, tipo: m.type === 'entrada' ? 'entrada' : 'salida', cantidad: Number(m.qty), referencia: m.ref || null }).select('id')).catch(function (e) { avisoError('el movimiento de ' + m.prod, e); }); });
  });
}

/* SUNAT: el estado real lo da Nooki (ya no se simula) */
function emitirSunat(p) { if (p.kind === 'Nota de venta') p.sunat = 'interno'; else if (!p._db) p.sunat = 'pendiente'; }

var SYNC_T = null;
function sincronizar() {
  clearTimeout(SYNC_T);
  SYNC_T = setTimeout(function () {
    if (PUENTE.rol === 'dueno') return;   // el dueño solo mira
    try {
      RES.forEach(function (r) {
        if (!r._db) { guardarReserva(r); return; }
        cambiosReserva(r); cambiosConsumos(r); cambiosPagos(r);
      });
      cambiosLimpieza(); cambiosCaja(); cambiosAjustes(); cambiosStock();
    } catch (e) { console.error(e); toast('No se pudo guardar un cambio. Recarga la página.', { icon: 'alert' }); }
  }, 0);
}
var refreshBase = refresh, renderBase = render;
refresh = function () { var x = refreshBase.apply(this, arguments); sincronizar(); return x; };
render = function () { var x = renderBase.apply(this, arguments); sincronizar(); return x; };

/* Ganchos para las pruebas automáticas (las mismas funciones que usan los botones) */
window.NKS = {
  res: function () { return RES; }, hoy: function () { return TODAY; }, refresh: function () { refresh(); },
  checkin: function (r) { checkin(r); }, checkout: function (r) { doCheckout(r, false); },
  pagar: function (r, monto, metodo, tipo) { var p = addPay(r, monto, metodo, tipo, TODAY, nowHM()); emitirSunat(p); refresh(); return p; },
  caja: function (abrir, monto) { state.cajaOpenAmt = monto || 0; setCaja(abrir); refresh(); }
};
