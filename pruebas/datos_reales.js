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
