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
  // Día de trabajo = día del año (1 de enero = 1)
  DAYNO = Math.round((Date.parse(D.hoy) - Date.UTC(ANIO, 0, 1)) / 864e5) + 1;
  (function () { var b = document.querySelector('.tag.day b'); if (b) b.textContent = DAYNO; })();

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
      d: fromIso(isoLima(t)), h: hhmm(t), sunat: cp.estado || 'pendiente', anulado: !!p.anulado || cp.estado === 'anulado', _id: p.id, _comp: p.comprobante_id || null });
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

  var KIND = { boleta: 'Boleta', factura: 'Factura', nota_venta: 'Nota de venta', nota_credito: 'Nota de crédito' };
  function cliComp(c) { return { name: c.cliente_nombre || 'Clientes varios', doc: c.cliente_num_doc || '—', docType: DOC[c.cliente_tipo_doc] || 'DNI' }; }

  /* Restaurante: pedidos abiertos en sus mesas y cobros de los últimos dos meses */
  var mesaDe = {}; TABLES.forEach(function (t) { mesaDe[t.id] = t; });
  var pedDb = {}; (D.pedidos || []).concat(D.pedidosAbiertos || []).forEach(function (x) { pedDb[x.id] = x; });
  var itemsDe = {}; (D.pedidoItems || []).forEach(function (i) { (itemsDe[i.pedido_id] = itemsDe[i.pedido_id] || []).push(i); });
  (D.pedidosAbiertos || []).forEach(function (x) {
    var t = mesaDe[x.mesa_id]; if (!t || t.order) return;
    t.order = { items: (itemsDe[x.id] || []).map(function (i) { return { n: i.descripcion, p: Number(i.precio), q: Number(i.cantidad), sent: Number(i.enviados || 0) }; }),
      since: hhmm(new Date(x.abierto_en)), mozo: x.mozo || '', state: x.estado === 'precuenta' ? 'precuenta' : 'abierta', _id: x.id };
  });
  function lugarPedido(id) { var x = pedDb[id], t = x && mesaDe[x.mesa_id]; return t ? 'Mesa ' + t.n + ' · ' + t.amb : 'Restaurante'; }
  (D.pagosRest || []).forEach(function (x) {
    var cp = comp[x.comprobante_id] || {}, t = new Date(x.creado_en);
    EXTRA.push({ id: x.id, r: null, place: lugarPedido(x.pedido_id), cli: cliComp(cp),
      items: (itemsDe[x.pedido_id] || []).map(function (i) { return { n: i.descripcion, p: Number(i.precio), q: Number(i.cantidad) }; }),
      doc: cp.numero_completo || '', method: x.forma_pago, amount: Number(x.monto), kind: KIND[cp.tipo] || 'Boleta', d: fromIso(isoLima(t)), h: hhmm(t),
      sunat: cp.estado || 'pendiente', anulado: !!x.anulado || cp.estado === 'anulado', _db: true, _anulado: !!x.anulado || cp.estado === 'anulado', _id: x.id, _comp: x.comprobante_id || null, _ped: x.pedido_id });
    if (x.id > PID) PID = x.id;
  });

  /* Notas de crédito: se enlazan con el comprobante que corrigen */
  var porComp = {};
  RES.forEach(function (r) { r.pays.forEach(function (x) { if (x._comp) porComp[x._comp] = x; }); });
  EXTRA.forEach(function (x) { if (x._comp) porComp[x._comp] = x; });
  var MOT = { '01': 'Anulación de la operación', '02': 'Anulación por error en el RUC', '04': 'Descuento global', '06': 'Devolución total', '07': 'Devolución por ítem', '09': 'Disminución en el valor' };
  (D.notasCredito || []).forEach(function (c) {
    var ref = porComp[c.afectado_id], af = comp[c.afectado_id] || {}, t = new Date(c.emitido_en);
    var n = { id: 1000000 + c.id, r: null, place: ref ? placeOf(ref) : '', cli: cliComp(c), items: [], doc: c.numero_completo || c.serie, method: '—', amount: -Number(c.total),
      kind: 'Nota de crédito', d: fromIso(isoLima(t)), h: hhmm(t), anulado: c.estado === 'anulado', ref: ref ? ref.id : null, refDoc: af.numero_completo || '',
      motivo: { c: c.motivo_nota || '01', l: MOT[c.motivo_nota] || c.descripcion_motivo || '' }, sunat: c.estado, _db: true, _anulado: c.estado === 'anulado', _comp: c.id };
    EXTRA.push(n); if (ref) ref.ncs = (ref.ncs || []).concat(n.id);
  });
  EXTRA.sort(function (a, b) { return (b.d - a.d) || (a.h < b.h ? 1 : a.h > b.h ? -1 : 0); });

  /* Caja: lo que entró y salió en el turno abierto, y los turnos cerrados */
  function movsDe(turno) {
    var l = (D.pagosEfectivo || []).filter(function (x) { return x.turno_id === turno; }).map(function (x) {
      var cp = comp[x.comprobante_id] || {};
      return { t: x.creado_en, h: hhmm(new Date(x.creado_en)), type: 'ingreso', cat: x.pedido_id ? 'Venta de restaurante' : 'Cobro de hospedaje', desc: cp.numero_completo || '', amount: Number(x.monto), who: '', _db: true };
    }).concat((D.cajaMov || []).filter(function (m) { return m.turno_id === turno; }).map(function (m) {
      return { t: m.creado_en, h: hhmm(new Date(m.creado_en)), type: m.tipo, cat: m.motivo, desc: m.descripcion || '', amount: Number(m.monto), who: '', _db: true };
    }));
    return l.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
  }
  state.mov = D.caja ? movsDe(D.caja.id) : [];
  TURNOS = (D.turnos || []).map(function (t) {
    var m = movsDe(t.id), inc = 0, out = 0, a = new Date(t.abierto_en), b = new Date(t.cerrado_en), da = fromIso(isoLima(a));
    m.forEach(function (x) { if (x.type === 'ingreso') inc += x.amount; else out += x.amount; });
    return { day: DAYNO - (TODAY - da), who: t.responsable, from: fmtD(da) + ' · ' + hhmm(a), to: fmtD(fromIso(isoLima(b))) + ' · ' + hhmm(b), a: Number(t.monto_inicial || 0),
      inc: inc, out: out, cont: t.contado != null ? Number(t.contado) : Math.round((Number(t.monto_inicial || 0) + inc - out) * 100) / 100, _db: true };
  });

  /* Días cerrados */
  CIERRES = (D.cierres || []).map(function (c) {
    var d = fromIso(c.fecha);
    return { day: DAYNO - (TODAY - d), d: d, who: c.responsable, h: hhmm(new Date(c.cerrado_en)), ing: Number(c.ingresos), occ: Number(c.ocupacion_pct), arr: c.llegadas, out: c.salidas, _db: true };
  });

  /* Clientes guardados (para buscarlos en Nueva reserva y en Clientes) */
  var ya = {}; RES.forEach(function (r) { ya[r.guest.doc] = 1; });
  (D.clientesTodos || []).forEach(function (c) {
    if (c.tipo_doc === '6' || !c.num_doc || ya[c.num_doc]) return; ya[c.num_doc] = 1;
    CLI_EXTRA.push({ name: c.nombre, doc: c.num_doc, docType: DOC[c.tipo_doc] || 'DNI', nat: c.nacionalidad || 'Perú', phone: c.telefono || '', _cli: c.id });
    if (c.no_grato && !NOGRATO[c.num_doc]) NOGRATO[c.num_doc] = { motivo: c.motivo_no_grato || '', d: TODAY };
  });
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
          e.textContent = textoClave(r);
          e.hidden = false; inp.value = ''; inp.focus();
        }, function () { e.textContent = 'Sin conexión: no se pudo verificar la clave.'; e.hidden = false; });
      };
      $('#admGo', w).onclick = go2; inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go2(); });
    } });
}

function textoClave(r) {
  var m = r && r.motivo;
  if (m === 'incorrecta') return r.intentos_restantes != null ? 'Clave incorrecta. Te quedan ' + r.intentos_restantes + ' intentos.' : 'Clave incorrecta.';
  return { espera: 'Demasiados intentos. Espera 1 minuto.', sin_clave: 'Todavía no hay clave de administrador. La crea el administrador (Nooki) en Ajustes.',
    sin_permiso: 'Tu cuenta no puede hacer esto.' }[m] || 'No se pudo verificar la clave.';
}

/* Pantalla de bloqueo de Ajustes y Auditoría: la clave se revisa en el servidor (nunca la "1234" de demostración) */
function lockedView(t) {
  return '<div class="noperm card adm-lock"><span class="np-ic">' + ic('login') + '</span><h2>' + esc(t) + ' pide la clave de administrador</h2><p>Escríbela para entrar. Queda abierto ' + ADM.MIN + ' minutos o hasta que toques «Bloquear».</p>' +
    '<form class="adm-f" data-form="adm" data-t="' + esc(t) + '"><input id="admPin" type="password" autocomplete="off" aria-label="Clave de administrador" placeholder="••••"><button class="btn btn-primary btn-lg">' + ic('login') + 'Entrar</button></form><p class="ferr" id="admE" hidden></p></div>';
}
document.addEventListener('submit', function (e) {
  if (!e.target.matches || !e.target.matches('[data-form="adm"]')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  var i = $('#admPin'), er = $('#admE'), b = e.target.querySelector('button');
  if (!i || !i.value.trim()) return;
  if (b) b.disabled = true;
  PUENTE.clave(i.value.trim()).then(function (r) {
    if (b) b.disabled = false;
    if (r && r.ok) { renovarAdmin(); actualizarAdmChip(); render(); return; }
    er.textContent = textoClave(r); er.hidden = false; i.value = ''; i.focus();
  }, function () { if (b) b.disabled = false; er.textContent = 'Sin conexión: no se pudo verificar la clave.'; er.hidden = false; });
}, true);

/* Ajustes → Clave de administrador: se crea o cambia en el servidor (queda guardada cifrada) */
var HAY_CLAVE = null;
PUENTE.sb.rpc('hay_clave').then(function (r) { HAY_CLAVE = !r.error && !!r.data; });
function seguridadBody() {
  var pide = HAY_CLAVE !== false && PUENTE.rol !== 'admin';
  return '<p class="hint" style="margin-top:0">La PC de recepción no tiene usuarios. Esta clave protege lo delicado: Ajustes, Auditoría, anular comprobantes, notas de crédito, anular reservas y cambiar precios. Dásela solo al administrador o al dueño.</p>' +
    (HAY_CLAVE === false ? '<div class="warn">' + ic('alert') + '<span>Todavía no hay clave de administrador. Créala aquí.</span></div>' : '') +
    '<div class="g2">' + (pide ? inp('scA', 'Clave actual', '', { type: 'password' }) + '<span></span>' : '') +
    inp('scN', 'Clave nueva', '', { type: 'password', hint: 'Mínimo 4 caracteres. No la compartas por chat.' }) + inp('scR', 'Repite la clave nueva', '', { type: 'password' }) + '</div>' +
    '<p class="ferr" id="scE" hidden></p><div><button class="btn btn-primary" data-act="adm-save">' + ic('check') + (HAY_CLAVE === false ? 'Crear clave' : 'Cambiar clave') + '</button></div>' +
    '<p class="hint">Después de 5 intentos equivocados el sistema espera 1 minuto. Todos los intentos quedan en Auditoría.</p>';
}
var admLockBase = ACT['adm-lock'];
Object.assign(ACT, {
  'adm-save': function () {
    var a = $('#scA'), n = $('#scN').value, r2 = $('#scR').value, e = $('#scE');
    var m = n.length < 4 ? 'La clave nueva debe tener al menos 4 caracteres.' : n !== r2 ? 'Las dos claves nuevas no coinciden.' : a && !a.value ? 'Escribe la clave actual.' : '';
    if (m) { e.textContent = m; e.hidden = false; return; }
    PUENTE.sb.rpc('cambiar_clave', { p_actual: a ? a.value : null, p_nueva: n }).then(function (res) {
      var r = res.data;
      if (!res.error && r && r.ok) { var nueva = HAY_CLAVE === false; HAY_CLAVE = true; toast(nueva ? 'Clave de administrador creada' : 'Clave de administrador cambiada', { icon: 'login' }); render({ soft: true }); return; }
      e.textContent = res.error ? 'No se pudo guardar la clave.' : ({ actual_incorrecta: 'La clave actual no es correcta.', clave_cerrada: 'La clave se cerró. Vuelve a entrar a Ajustes.',
        muy_corta: 'La clave debe tener al menos 4 caracteres.', sin_permiso: 'Tu cuenta no puede cambiar la clave.' }[r && r.motivo] || 'No se pudo cambiar la clave.');
      e.hidden = false;
    }, function () { e.textContent = 'Sin conexión: no se guardó la clave.'; e.hidden = false; });
  },
  'adm-lock': function () { PUENTE.sb.rpc('bloquear_clave').then(function () {}, function () {}); if (admLockBase) admLockBase.apply(this, arguments); }
});

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
  SYNC.nograto = JSON.stringify(NOGRATO);
  SYNC.ped = {};
  var itemsDe = {}; (D.pedidoItems || []).forEach(function (i) { (itemsDe[i.pedido_id] = itemsDe[i.pedido_id] || []).push(i); });
  TABLES.forEach(function (t) {
    if (!t.order || !t.order._id) return;
    var m = {}; (itemsDe[t.order._id] || []).forEach(function (i) { m[i.descripcion] = { id: i.id, q: Number(i.cantidad), sent: Number(i.enviados || 0) }; });
    SYNC.ped[t.order._id] = { mesa: t.id, place: lugarMesa(t), obj: t.order, st: t.order.state, items: m };
  });
  TURNOS.forEach(function (t) { t._db = true; });
})();
function lugarMesa(t) { return 'Mesa ' + t.n + ' · ' + t.amb; }
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
function cliPago(r, p) {
  if (!r) {   // cobro del restaurante
    var c = p.cli || {}, doc = c.doc && c.doc !== '—' ? c.doc : null;
    if (p.kind === 'Factura') return { tipo_doc: '6', num_doc: doc, nombre: c.name };
    return doc ? { tipo_doc: DOC_COD[c.docType] || '1', num_doc: doc, nombre: c.name } : { tipo_doc: '0', num_doc: null, nombre: c.name || 'Clientes varios' };
  }
  return p.kind === 'Factura' && r.company ? { tipo_doc: '6', num_doc: r.company.ruc, nombre: r.company.name }
    : r.guest && r.guest.doc ? { tipo_doc: DOC_COD[r.guest.docType] || '1', num_doc: r.guest.doc, nombre: r.guest.name } : { tipo_doc: '0', num_doc: null, nombre: (r.guest && r.guest.name) || 'Clientes varios' };
}
/* Pide a Nooki el comprobante de un pago ya guardado y muestra el número real */
function emitirComprobante(p, cli) {
  p.doc = 'Emitiendo…'; p.sunat = p.kind === 'Nota de venta' ? 'interno' : 'pendiente'; refreshBase();
  return facturar({ accion: 'emitir', pago_id: p._id, tipo: TIPO_COMP[p.kind] || 'boleta', cliente: cli }).then(function (x) {
    var c = x.comprobante || {}; p.doc = c.numero_completo || c.serie || ''; p.sunat = c.estado || 'pendiente'; p._comp = c.id;
    toast(c.estado === 'aceptado' || c.estado === 'observado' ? 'SUNAT aceptó la ' + p.kind.toLowerCase() + ' ' + p.doc
      : c.estado === 'interno' ? 'Nota de venta ' + p.doc : 'Comprobante ' + p.doc + ': ' + (c.mensaje_sunat || c.estado), { icon: c.estado === 'error' ? 'alert' : undefined });
  }, function (e) { p.doc = 'Sin comprobante'; p.sunat = 'error'; avisoError('el comprobante (el pago sí quedó guardado)', e); });
}
function cambiosPagos(r) {
  r.pays.forEach(function (p) {
    if (!p._db && !p._guardando) {
      p._guardando = true;
      enCola(function () {
        return db(PUENTE.sb.from('pagos').insert({ reserva_id: r.id, turno_id: SYNC.turno, forma_pago: p.method, monto: Number(p.amount),
          tipo: r.state === 'ocupado' || r.state === 'finalizada' ? 'pago' : 'adelanto' }).select('id')).then(function (f) {
          p._db = true; p._id = f[0].id;
          return emitirComprobante(p, cliPago(r, p));
        }).catch(function (e) { if (!p._db) { avisoError('el pago de ' + money(p.amount), e); var i = r.pays.indexOf(p); if (i >= 0) r.pays.splice(i, 1); } })
          .then(function () { p._guardando = false; refreshBase(); });
      });
    } else anulacion(p);
  });
}
/* Anular un comprobante: baja en SUNAT (si estaba aceptado) y el pago queda anulado */
function anulacion(p) {
  if (!p._db || !p.anulado || p._anulado) return;
  p._anulado = true;
  var motivo = (p.anul && p.anul.motivo) || 'Anulado desde recepción', enSunat = p._comp && p.kind !== 'Nota de venta' && p.sunat === 'anulado';
  enCola(function () {
    return (enSunat ? facturar({ accion: 'anular', comprobante_id: p._comp, motivo: motivo }) : Promise.resolve(null)).then(function (x) {
      if (enSunat) toast('Anulación enviada a SUNAT: ' + p.doc, { icon: 'trash' });
      if (x && x.comprobante && x.comprobante.estado) p.sunat = x.comprobante.estado;
      return p._id ? db(PUENTE.sb.from('pagos').update({ anulado: true, motivo_anulacion: motivo }).eq('id', p._id).select('id')) : null;
    }).catch(function (e) {
      avisoError('la anulación de ' + p.doc, e);
      p.anulado = false; p._anulado = false; p.sunat = 'aceptado'; delete p.anul; refreshBase();
    });
  });
}

/* Notas de crédito emitidas desde Ventas */
function cambiosNotasCredito() {
  EXTRA.forEach(function (n) {
    if (n.kind !== 'Nota de crédito') return;
    if (n._db) { anulacion(n); return; }
    if (n._guardando) return;
    n._guardando = true; n._ref = n._ref || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var ref = findPay(n.ref);
    n.doc = 'Emitiendo…';
    enCola(function () {
      if (!ref || !ref._comp) return Promise.reject({ mensaje: 'el comprobante original todavía no tiene número en SUNAT' });
      return facturar({ accion: 'nota_credito', comprobante_id: ref._comp, motivo: n.motivo.c, descripcion: n.motivo.l, monto: -Number(n.amount), ref: n._ref }).then(function (x) {
        var c = x.comprobante || {}; n._db = true; n._comp = c.id; n.doc = c.numero_completo || c.serie || ''; n.sunat = c.estado || 'pendiente';
        toast(c.estado === 'aceptado' || c.estado === 'observado' ? 'SUNAT aceptó la nota de crédito ' + n.doc : 'Nota de crédito ' + n.doc + ': ' + (c.mensaje_sunat || c.estado), { icon: c.estado === 'error' ? 'alert' : undefined });
      });
    }).catch(function (e) {
      avisoError('la nota de crédito', e);
      var i = EXTRA.indexOf(n); if (i >= 0) EXTRA.splice(i, 1);
      if (ref && ref.ncs) ref.ncs = ref.ncs.filter(function (id) { return id !== n.id; });
    }).then(function () { n._guardando = false; refreshBase(); });
  });
}

/* Restaurante: pedidos por mesa, cobros (con su comprobante) y cargos a la habitación */
var REST_PEND = false;
function cambiosRestaurante() {
  if (REST_PEND) return; REST_PEND = true;
  enCola(function () { REST_PEND = false; return syncRestaurante(); });
}
function itemsPedido(id, items, prev) {
  var ahora = {}, p = Promise.resolve();
  items.forEach(function (i) { if (Number(i.q) > 0) { var a = ahora[i.n] = ahora[i.n] || { q: 0, sent: 0, p: Number(i.p) }; a.q += Number(i.q); a.sent += Number(i.sent || 0); } });
  Object.keys(ahora).forEach(function (n) {
    var a = ahora[n], b = prev[n], env = Math.min(a.sent, a.q);
    if (!b) p = p.then(function () {
      var pr = PROD(n), dest = pr && (pr.dest === 'Cocina' || pr.dest === 'Barra') ? pr.dest : null;
      return db(PUENTE.sb.from('pedido_items').insert({ pedido_id: id, producto_id: SYNC.prodId[n] || null, descripcion: n, precio: a.p, cantidad: a.q, enviados: env, destino: dest }).select('id'))
        .then(function (f) { prev[n] = { id: f[0].id, q: a.q, sent: env }; });
    });
    else if (b.q !== a.q || b.sent !== env) p = p.then(function () {
      return db(PUENTE.sb.from('pedido_items').update({ cantidad: a.q, enviados: env }).eq('id', b.id).select('id')).then(function () { b.q = a.q; b.sent = env; });
    });
  });
  Object.keys(prev).forEach(function (n) {
    if (ahora[n]) return; var b = prev[n]; delete prev[n];
    p = p.then(function () { return db(PUENTE.sb.from('pedido_items').delete().eq('id', b.id).select('id')); });
  });
  return p;
}
function syncRestaurante() {
  var pasos = Promise.resolve(), ahora = new Date().toISOString();
  function paso(fn) { pasos = pasos.then(fn).catch(function (e) { avisoError('el pedido del restaurante', e); }); }
  // pedidos que ya no están en ninguna mesa: se cobraron, se cargaron a una habitación o se anularon
  Object.keys(SYNC.ped).forEach(function (k) {
    var s = SYNC.ped[k], id = Number(k);
    if (TABLES.some(function (t) { return t.order === s.obj; })) return;
    delete SYNC.ped[k];
    var pago = EXTRA.filter(function (x) { return !x._db && !x._ped && x.kind !== 'Nota de crédito' && x.place === s.place; })[0];
    if (pago) { pago._ped = id; pago._pedItems = s.items; return; }   // lo cierra el cobro
    var mesa = s.place.split(' · ')[0] + ' · ', r = null;
    RES.some(function (x) {
      var l = (x.log || []).filter(function (e) { return !e._ped && String(e.text || '').indexOf('Consumo de restaurante · ' + mesa) === 0; })[0];
      if (l) { l._ped = id; r = x; return true; } return false;
    });
    paso(function () { return db(PUENTE.sb.from('pedidos').update({ estado: r ? 'cargada' : 'anulada', reserva_id: r && r._db ? r.id : null, cerrado_en: ahora }).eq('id', id).select('id')); });
  });
  // pedidos en las mesas
  TABLES.forEach(function (t) {
    var o = t.order; if (!o) return;
    if (!o._id) {
      if (o._guardando) return; o._guardando = true;
      paso(function () {
        return db(PUENTE.sb.from('pedidos').insert({ mesa_id: t.id, mozo: o.mozo || null, estado: o.state === 'precuenta' ? 'precuenta' : 'abierta' }).select('id')).then(function (f) {
          o._id = f[0].id; o._guardando = false;
          var mesa = TABLES.filter(function (x) { return x.order === o; })[0] || t;
          SYNC.ped[o._id] = { mesa: mesa.id, place: lugarMesa(mesa), obj: o, st: o.state, items: {} };
          if (mesa.id !== t.id) return db(PUENTE.sb.from('pedidos').update({ mesa_id: mesa.id }).eq('id', o._id).select('id')).then(function () { return itemsPedido(o._id, o.items, SYNC.ped[o._id].items); });
          return itemsPedido(o._id, o.items, SYNC.ped[o._id].items);
        }, function (e) { o._guardando = false; throw e; });
      });
      return;
    }
    var s = SYNC.ped[o._id]; if (!s) return;
    var c = {};
    if (s.mesa !== t.id) { c.mesa_id = t.id; s.mesa = t.id; s.place = lugarMesa(t); }
    if (s.st !== o.state) { c.estado = o.state === 'precuenta' ? 'precuenta' : 'abierta'; s.st = o.state; }
    if (Object.keys(c).length) paso(function () { return db(PUENTE.sb.from('pedidos').update(c).eq('id', o._id).select('id')); });
    paso(function () { return itemsPedido(o._id, o.items, s.items); });
  });
  // cobros del restaurante
  EXTRA.forEach(function (x) {
    if (x.kind === 'Nota de crédito') return;
    if (x._db) { anulacion(x); return; }
    if (x._guardando) return; x._guardando = true;
    paso(function () { return cobroRestaurante(x, ahora); });
  });
  return pasos;
}
function cobroRestaurante(x, ahora) {
  var mesa = TABLES.filter(function (t) { return lugarMesa(t) === x.place; })[0];
  var items = (x.items || []).map(function (i) { return { n: i.n, p: i.p, q: i.q, sent: i.q }; });
  var pedido = x._ped
    ? db(PUENTE.sb.from('pedidos').update({ estado: 'cobrada', cerrado_en: ahora }).eq('id', x._ped).select('id')).then(function () { return x._ped; })
    : db(PUENTE.sb.from('pedidos').insert({ mesa_id: mesa ? mesa.id : null, estado: 'cobrada', cerrado_en: ahora }).select('id')).then(function (f) { return (x._ped = f[0].id); });
  return pedido.then(function (id) {
    return itemsPedido(id, items, x._pedItems || {}).then(function () {
      return db(PUENTE.sb.from('pagos').insert({ pedido_id: id, turno_id: SYNC.turno, forma_pago: x.method, monto: Number(x.amount), tipo: 'restaurante' }).select('id'));
    });
  }).then(function (f) {
    x._db = true; x._id = f[0].id; delete x._pedItems;
    return emitirComprobante(x, cliPago(null, x));
  }).catch(function (e) { avisoError('el cobro de la ' + x.place, e); }).then(function () { x._guardando = false; refreshBase(); });
}

/* Clientes nuevos y "no grato" */
function cambiosClientes() {
  CLI_EXTRA.forEach(function (g) {
    if (g._cli || g._guardando) return; g._guardando = true;
    enCola(function () { return asegurarCliente(g).catch(function (e) { avisoError('el cliente ' + g.name, e); }).then(function () { g._guardando = false; }); });
  });
  var ahora = JSON.stringify(NOGRATO);
  if (ahora === SYNC.nograto) return;
  var antes = JSON.parse(SYNC.nograto); SYNC.nograto = ahora;
  Object.keys(NOGRATO).forEach(function (doc) { if (!antes[doc] || antes[doc].motivo !== NOGRATO[doc].motivo) marcarNoGrato(doc, true, NOGRATO[doc].motivo); });
  Object.keys(antes).forEach(function (doc) { if (!NOGRATO[doc]) marcarNoGrato(doc, false, null); });
}
function marcarNoGrato(doc, si, motivo) {
  var c = cliData().filter(function (x) { return x.g.doc === doc; })[0], g = c ? c.g : { doc: doc, name: 'Sin nombre', docType: 'DNI' };
  enCola(function () {
    return asegurarCliente(g).then(function (id) {
      return db(PUENTE.sb.from('clientes').update({ no_grato: si, motivo_no_grato: si ? motivo : null }).eq('id', id).select('id'));
    }).catch(function (e) { avisoError('el cliente ' + (g.name || doc), e); });
  });
}

/* Cierre del día: se guarda en la base. La fecha la da el reloj (no se adelanta a mano) */
function closeDay() {
  if (CIERRES.some(function (c) { return c.d === TODAY; })) { toast('El día de hoy ya está cerrado', { icon: 'alert' }); return; }
  var N = dayNums(), pct = isFinite(N.pct) ? N.pct : 0;
  openModal({ title: 'Cerrar el día · ' + fmtD(TODAY), width: 460,
    body: '<p>Se guardará el resumen del ' + fmtDL(TODAY) + '. El sistema pasa solo al día siguiente a la medianoche.</p><dl class="stay"><div><dt>Ingresos</dt><dd>' + money(N.ing) + '</dd></div><div><dt>Ocupación</dt><dd>' + pct + '%</dd></div></dl><p class="hint">Esto no se puede deshacer.</p>',
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn btn-ok" id="czGo">' + ic('check') + 'Sí, cerrar el día</button>',
    onMount: function (w) {
      var b = $('#czGo', w);
      b.onclick = function () {
        b.disabled = true;
        db(PUENTE.sb.from('cierres').insert({ fecha: iso(TODAY), responsable: ME(), ingresos: Math.round(N.ing * 100) / 100, ocupacion_pct: pct, llegadas: N.ins, salidas: N.outs,
          resumen: { por_forma_pago: N.by, ocupadas: N.occ, cobros: N.pays.length } }).select('id')).then(function () {
          CIERRES.unshift({ day: DAYNO, d: TODAY, who: ME(), h: nowHM(), ing: N.ing, occ: pct, arr: N.ins, out: N.outs, _db: true });
          closeModal(true); toast('Día cerrado y guardado · ' + fmtDL(TODAY), { icon: 'check' }); go('inicio');
        }, function (e) { b.disabled = false; avisoError('el cierre del día', e); });
      };
    } });
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

var MOV_AUTO = { 'Cobro de hospedaje': 1, 'Venta de restaurante': 1 };   // ya cuentan como pagos en efectivo del turno
function cambiosCaja() {
  var abrir = state.caja && !SYNC.caja, cerrar = !state.caja && SYNC.caja;
  SYNC.caja = state.caja;
  if (abrir) {
    enCola(function () {
      return db(PUENTE.sb.from('caja_turnos').insert({ responsable: ME(), monto_inicial: Number(state.cajaOpenAmt || 0) }).select('id'))
        .then(function (f) { SYNC.turno = f[0].id; }, function (e) { avisoError('la apertura de caja', e); });
    });
  }
  (state.mov || []).forEach(function (m) {
    if (m._db) return; m._db = true;
    if (MOV_AUTO[m.cat]) return;
    enCola(function () {
      if (!SYNC.turno) { avisoError('el movimiento de caja', { mensaje: 'la caja no está abierta' }); return; }
      return db(PUENTE.sb.from('caja_movimientos').insert({ turno_id: SYNC.turno, tipo: m.type === 'salida' ? 'salida' : 'ingreso', motivo: m.cat || 'Otro',
        forma_pago: 'Efectivo', monto: Number(m.amount), descripcion: m.desc || null }).select('id')).catch(function (e) { avisoError('el movimiento de caja de ' + money(m.amount), e); });
    });
  });
  if (cerrar) {
    var t = TURNOS[0], cont = t && !t._db ? Number(t.cont) : null; if (t) t._db = true;
    enCola(function () {
      var id = SYNC.turno; if (!id) return; SYNC.turno = null;
      return db(PUENTE.sb.from('caja_turnos').update({ cerrado_en: new Date().toISOString(), contado: cont, notas: 'Cerrada en recepción' }).eq('id', id).select('id')).catch(function (e) { avisoError('el cierre de caja', e); });
    });
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
      cambiosCaja(); cambiosRestaurante(); cambiosNotasCredito(); cambiosClientes();
      cambiosLimpieza(); cambiosAjustes(); cambiosStock();
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
  caja: function (abrir, monto) { if (abrir) { state.cajaOpenAmt = monto || 0; state.mov = []; } setCaja(abrir); refresh(); },
  mesas: function () { return TABLES; }, extra: function () { return EXTRA; }, mov: function () { return state.mov; }, turnos: function () { return TURNOS; },
  noGrato: function () { return NOGRATO; }, nuevoId: function () { return ++PID; }, cerrarDia: function () { closeDay(); }, ahora: function () { return nowHM(); }
};
