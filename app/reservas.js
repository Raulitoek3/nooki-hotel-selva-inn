/* Hotel Selva Inn · Reservas: panel del día, nueva reserva, lista, ficha de la reserva y clientes */
(function () {
  'use strict';
  var HS = window.HS, sb = HS.sb, $ = HS.$, esc = HS.esc, q = HS.q, soles = HS.soles;
  var TODOS = ['admin', 'recepcion', 'dueno'], OPERAN = ['admin', 'recepcion'];

  var EST_RES = {
    reservado:  ['Reservada', 'r-res'], confirmado: ['Confirmada', 'r-conf'], ocupado: ['En casa', 'r-occ'],
    finalizada: ['Finalizada', 'e-off'], anulada: ['Anulada', 'r-anul'], no_show: ['No llegó', 'e-off']
  };
  var DOCS = { '1': 'DNI', '4': 'Carné de extranjería', '7': 'Pasaporte', '6': 'RUC', '0': 'Sin documento' };
  var ACTIVAS = ['reservado', 'confirmado', 'ocupado'];

  function puedeOperar() { return HS.yo().rol !== 'dueno'; }
  function pillRes(e) { var x = EST_RES[e] || [e, 'e-off']; return '<span class="pill ' + x[1] + '">' + x[0] + '</span>'; }
  function sumarDias(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
  function noches(r) { return Math.max(1, diasEntre(r.entrada, r.salida)); }
  function fCorta(iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function fLarga(iso) { var s = new Date(iso + 'T12:00:00Z').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); return s.charAt(0).toUpperCase() + s.slice(1); }
  function docTxt(c) { return c && c.num_doc ? (DOCS[c.tipo_doc] || 'Doc.') + ' ' + c.num_doc : 'Sin documento'; }
  function vacio(t) { return '<div class="card vacio">' + t + '</div>'; }
  function cabeza(titulo, sub, botones) {
    return '<div class="cabeza"><div><h1>' + titulo + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (botones ? '<div class="botones">' + botones + '</div>' : '') + '</div>';
  }
  function porId(lista) { var m = {}; lista.forEach(function (x) { m[x.id] = x; }); return m; }
  function clientesDe(ids) {
    ids = ids.filter(function (x, i) { return x != null && ids.indexOf(x) === i; });
    if (!ids.length) return Promise.resolve({});
    return q(sb.from('clientes').select('*').in('id', ids)).then(porId);
  }
  function catalogos() {
    return Promise.all([
      q(sb.from('origenes').select('*').eq('activo', true).order('orden')),
      q(sb.from('motivos_viaje').select('*').order('orden')),
      q(sb.from('formas_pago').select('*').eq('activa', true).order('orden')),
      q(sb.from('temporadas').select('*')),
      q(sb.from('config').select('*').eq('id', 1).maybeSingle())
    ]).then(function (d) { return { origenes: d[0], motivos: d[1], formas: d[2], temporadas: d[3], config: d[4] || {} }; });
  }
  // Precio de cada noche con temporadas y fin de semana; devuelve el promedio por noche
  function tarifaPromedio(base, entrada, salida, cat) {
    var n = Math.max(1, diasEntre(entrada, salida)), total = 0, c = cat.config;
    for (var i = 0; i < n; i++) {
      var dia = sumarDias(entrada, i), t = Number(base);
      cat.temporadas.forEach(function (s) { if (s.desde <= dia && dia <= s.hasta) t = t * (1 + Number(s.porcentaje) / 100); });
      var dow = new Date(dia + 'T12:00:00Z').getUTCDay();
      if (c.fin_semana_activo && (dow === 5 || dow === 6)) t = t * (1 + Number(c.fin_semana_pct) / 100);
      total += t;
    }
    return Math.round(total / n * 100) / 100;
  }
  function temporadaDe(entrada, cat) { var t = cat.temporadas.filter(function (s) { return s.desde <= entrada && entrada <= s.hasta; })[0]; return t ? t.nombre : ''; }

  /* =================== Panel del día =================== */
  var prefill = null;   // datos para abrir Nueva reserva desde el panel o el timeline

  function estadoPanel(h, r, limpias) {
    if (h.fuera_de_venta) return 'fuera';
    if (r) {
      if (r.estado === 'ocupado') return r.salida <= HS.hoyLima() ? 'sale' : 'ocupada';
      return 'llega';
    }
    return limpias[h.numero] ? 'limpieza' : 'libre';
  }
  var EST_PANEL = {
    libre: ['Libre', 'h-libre'], llega: ['Llega hoy', 'h-res'], ocupada: ['Ocupada', 'h-occ'], sale: ['Sale hoy', 'h-sale'],
    limpieza: ['Por limpiar', 'h-limpia'], fuera: ['Fuera de venta', 'h-fuera']
  };

  function renderPanel() {
    var hoy = HS.hoyLima();
    $('#contenido').innerHTML = cabeza('Panel de habitaciones', fLarga(hoy),
      puedeOperar() ? '<a class="btn btn-pri" href="#nueva">+ Nueva reserva</a>' : '') + '<div id="pnl">' + vacio('Cargando…') + '</div>';
    Promise.all([
      HS.cargarHotel(),
      q(sb.from('reservas').select('*').lte('entrada', hoy).gte('salida', hoy).in('estado', ACTIVAS)),
      q(sb.from('limpieza').select('habitacion, estado').neq('estado', 'lista'))
    ]).then(function (d) {
      var H = d[0], porHab = {}, limpias = {};
      d[1].forEach(function (r) {
        if (r.salida === hoy && r.estado !== 'ocupado') return;   // ya debía haberse ido
        var prev = porHab[r.habitacion];
        if (!prev || r.estado === 'ocupado') porHab[r.habitacion] = r;
      });
      d[2].forEach(function (l) { limpias[l.habitacion] = l.estado; });
      return clientesDe(d[1].map(function (r) { return r.cliente_id; })).then(function (cli) {
        var cuenta = { libre: 0, llega: 0, ocupada: 0, sale: 0, limpieza: 0, fuera: 0 };
        H.habs.forEach(function (h) { cuenta[estadoPanel(h, porHab[h.numero], limpias)]++; });
        var pisos = HS.pisosDe(H);
        $('#pnl').innerHTML =
          '<div class="kpis">' +
            kpi('Ocupadas', cuenta.ocupada + cuenta.sale, 'h-occ') + kpi('Llegan hoy', cuenta.llega, 'h-res') +
            kpi('Salen hoy', cuenta.sale, 'h-sale') + kpi('Libres', cuenta.libre, 'h-libre') + kpi('Por limpiar', cuenta.limpieza, 'h-limpia') +
          '</div>' +
          pisos.map(function (p) {
            return '<section class="card piso' + (p.lleno ? ' lleno' : '') + '"><div class="piso-cab"><div><h2>' + HS.nombrePiso(p.piso) + '</h2>' +
              '<p class="ayuda">' + HS.cuentaPisoTxt(p) + '</p></div>' + HS.estadoPisoHtml(p) + '</div>' +
              '<div class="habs">' + p.habs.map(function (h) {
                var r = porHab[h.numero], e = EST_PANEL[estadoPanel(h, r, limpias)], c = r && cli[r.cliente_id];
                return '<button type="button" class="hab ' + e[1] + '" data-n="' + esc(h.numero) + '"' + (r ? ' data-r="' + r.id + '"' : '') + '>' +
                  '<b>' + esc(h.numero) + '</b><span>' + esc(HS.nombreTipo(H, h.tipo)) + '</span>' +
                  (c ? '<span class="hab-cli">' + esc(c.nombre) + '</span>' : '') + '<i>' + e[0] + '</i></button>';
              }).join('') + '</div></section>';
          }).join('');
        $('#pnl').querySelectorAll('.hab').forEach(function (b) {
          b.addEventListener('click', function () {
            if (b.dataset.r) { HS.ir('#reserva/' + b.dataset.r); return; }
            if (!puedeOperar() || b.classList.contains('h-fuera')) return;
            prefill = { habitacion: b.dataset.n, entrada: hoy };
            HS.ir('#nueva');
          });
        });
      });
    }).catch(function (e) { $('#pnl').innerHTML = vacio(esc(e.mensaje)); });
  }
  function kpi(l, n, c) { return '<div class="card kpi ' + c + '"><b>' + n + '</b><span>' + l + '</span></div>'; }

  /* =================== Nueva reserva =================== */
  var nr = null;   // estado del formulario

  function renderNueva() {
    var hoy = HS.hoyLima(), pf = prefill || {}; prefill = null;
    nr = { cliente: null, entrada: pf.entrada || hoy, salida: sumarDias(pf.entrada || hoy, 1), elegidas: {}, precios: {}, precioLibre: false, H: null, cat: null, libres: [] };
    if (pf.habitacion) nr.elegidas[pf.habitacion] = true;
    $('#contenido').innerHTML = cabeza('Nueva reserva', 'Cliente, fechas y habitaciones. El precio sale de la tarifa y la temporada.', '<a class="btn" href="#reservas">Cancelar</a>') +
      '<div class="nr">' +
        '<section class="card nr-col"><h2>1 · Cliente</h2>' +
          '<label>Buscar por documento o nombre<input id="nBus" type="search" autocomplete="off" placeholder="DNI, pasaporte, RUC o nombre"></label>' +
          '<div id="nRes" class="nr-res"></div><div id="nCli"></div>' +
          '<button type="button" class="btn btn-sm" id="nNuevoCli">+ Cliente nuevo</button>' +
          '<div id="nFormCli" hidden class="nr-cli">' +
            '<div class="grid2"><label>Documento<select id="cTipo">' + Object.keys(DOCS).map(function (k) { return '<option value="' + k + '">' + DOCS[k] + '</option>'; }).join('') + '</select></label>' +
            '<label>Número<input id="cDoc" type="text" autocomplete="off"></label></div>' +
            '<label>Nombre completo<input id="cNom" type="text" autocomplete="off"></label>' +
            '<div class="grid2"><label>Nacionalidad<input id="cNac" type="text" value="Perú"></label><label>Teléfono<input id="cTel" type="tel"></label></div>' +
          '</div>' +
        '</section>' +
        '<section class="card nr-col"><h2>2 · Fechas y habitaciones</h2>' +
          '<div class="grid2"><label>Entrada<input id="nEnt" type="date" value="' + nr.entrada + '"></label><label>Salida<input id="nSal" type="date" value="' + nr.salida + '"></label></div>' +
          '<div class="grid2"><label>Personas<input id="nPer" type="number" min="1" max="200" value="1"></label><label>Tipo<select id="nTipo"><option value="">Todos los tipos</option></select></label></div>' +
          '<p class="ayuda" id="nInfo"></p><div id="nHabs" class="habs habs-sel"></div>' +
        '</section>' +
        '<section class="card nr-col"><h2>3 · Resumen</h2>' +
          '<div class="grid2"><label>Origen<select id="nOri"></select></label><label>Estado<select id="nEst"><option value="confirmado">Confirmada</option><option value="reservado">Reservada (sin confirmar)</option></select></label></div>' +
          '<label id="nExtCaja" hidden>Código de la reserva (Booking / Airbnb)<input id="nExt" type="text"></label>' +
          '<label>Motivo del viaje<select id="nMot"><option value="">—</option></select></label>' +
          '<div id="nResumen" class="nr-resumen"></div>' +
          '<label>Notas<input id="nNotas" type="text" placeholder="Opcional"></label>' +
          '<p class="err" id="nErr" hidden></p>' +
          '<button class="btn btn-pri btn-lg" type="button" id="nCrear">Crear reserva</button>' +
        '</section>' +
      '</div>';
    Promise.all([HS.cargarHotel(), catalogos()]).then(function (d) {
      nr.H = d[0]; nr.cat = d[1];
      $('#nTipo').innerHTML += nr.H.tiposLista.map(function (t) { return '<option value="' + esc(t.codigo) + '">' + esc(t.nombre) + '</option>'; }).join('');
      $('#nOri').innerHTML = nr.cat.origenes.map(function (o) { return '<option>' + esc(o.nombre) + '</option>'; }).join('');
      $('#nMot').innerHTML += nr.cat.motivos.map(function (m) { return '<option>' + esc(m.nombre) + '</option>'; }).join('');
      ['nEnt', 'nSal'].forEach(function (id) { $('#' + id).addEventListener('change', function () { nr.entrada = $('#nEnt').value; nr.salida = $('#nSal').value; cargarLibres(); }); });
      $('#nTipo').addEventListener('change', pintarHabs);
      $('#nOri').addEventListener('change', function () { $('#nExtCaja').hidden = !/booking|airbnb|expedia/i.test($('#nOri').value); });
      cargarLibres();
    }).catch(function (e) { $('#nErr').textContent = e.mensaje; $('#nErr').hidden = false; });

    var tBus;
    $('#nBus').addEventListener('input', function () { clearTimeout(tBus); tBus = setTimeout(buscarCliente, 250); });
    $('#nNuevoCli').addEventListener('click', function () { nr.cliente = null; $('#nCli').innerHTML = ''; $('#nFormCli').hidden = false; $('#cDoc').focus(); });
    $('#nCrear').addEventListener('click', crearReserva);
  }

  function buscarCliente() {
    var t = $('#nBus').value.trim();
    if (t.length < 2) { $('#nRes').innerHTML = ''; return; }
    var consulta = /^\d{4,}$/.test(t) ? sb.from('clientes').select('*').like('num_doc', t + '%').limit(8)
      : sb.from('clientes').select('*').ilike('nombre', '%' + t + '%').limit(8);
    q(consulta).then(function (lista) {
      $('#nRes').innerHTML = lista.length ? lista.map(function (c) {
        return '<button type="button" class="nr-op" data-id="' + c.id + '"><b>' + esc(c.nombre) + '</b><span>' + esc(docTxt(c)) + (c.no_grato ? ' · <em class="t-dan">No grato</em>' : '') + '</span></button>';
      }).join('') : '<p class="ayuda">No hay clientes con ese dato. Usa "+ Cliente nuevo".</p>';
      $('#nRes').querySelectorAll('.nr-op').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = lista.filter(function (x) { return String(x.id) === b.dataset.id; })[0];
          nr.cliente = c; $('#nFormCli').hidden = true; $('#nRes').innerHTML = ''; $('#nBus').value = '';
          $('#nCli').innerHTML = '<div class="nr-elegido' + (c.no_grato ? ' malo' : '') + '"><b>' + esc(c.nombre) + '</b><span>' + esc(docTxt(c)) + '</span>' +
            (c.no_grato ? '<span class="t-dan">Marcado como NO GRATO' + (c.motivo_no_grato ? ': ' + esc(c.motivo_no_grato) : '') + '</span>' : '') + '</div>';
        });
      });
    }).catch(function (e) { $('#nRes').innerHTML = '<p class="err">' + esc(e.mensaje) + '</p>'; });
  }

  function cargarLibres() {
    var info = $('#nInfo');
    if (!nr.entrada || !nr.salida || nr.salida <= nr.entrada) { info.textContent = 'La salida debe ser después de la entrada.'; $('#nHabs').innerHTML = ''; pintarResumen(); return; }
    info.textContent = 'Buscando habitaciones libres…';
    q(sb.from('reservas').select('habitacion').lt('entrada', nr.salida).gt('salida', nr.entrada).in('estado', ACTIVAS)).then(function (ocup) {
      var ocupadas = {}; ocup.forEach(function (r) { ocupadas[r.habitacion] = true; });
      nr.libres = nr.H.habs.filter(function (h) { return !h.fuera_de_venta && !ocupadas[h.numero]; });
      Object.keys(nr.elegidas).forEach(function (n) { if (ocupadas[n]) delete nr.elegidas[n]; });
      var n = diasEntre(nr.entrada, nr.salida), temp = temporadaDe(nr.entrada, nr.cat);
      info.textContent = n + (n === 1 ? ' noche' : ' noches') + ' · ' + nr.libres.length + ' habitaciones libres' + (temp ? ' · Temporada: ' + temp : '') + '. Toca para elegir (puedes elegir varias).';
      pintarHabs();
    }).catch(function (e) { info.textContent = e.mensaje; });
  }

  function pintarHabs() {
    var tipo = $('#nTipo').value;
    var lista = nr.libres.filter(function (h) { return !tipo || h.tipo === tipo; });
    $('#nHabs').innerHTML = lista.length ? lista.map(function (h) {
      var t = nr.H.tipos[h.tipo] || {};
      return '<button type="button" class="hab h-libre' + (nr.elegidas[h.numero] ? ' elegida' : '') + '" data-n="' + esc(h.numero) + '" aria-pressed="' + !!nr.elegidas[h.numero] + '">' +
        '<b>' + esc(h.numero) + '</b><span>' + esc(t.nombre || h.tipo) + '</span><i>' + soles(tarifaPromedio(t.tarifa || 0, nr.entrada, nr.salida, nr.cat)) + ' / noche</i></button>';
    }).join('') : '<p class="ayuda">No hay habitaciones libres con esos datos.</p>';
    $('#nHabs').querySelectorAll('.hab').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.dataset.n;
        if (nr.elegidas[n]) delete nr.elegidas[n]; else nr.elegidas[n] = true;
        b.classList.toggle('elegida', !!nr.elegidas[n]); b.setAttribute('aria-pressed', !!nr.elegidas[n]);
        pintarResumen();
      });
    });
    pintarResumen();
  }

  function pintarResumen() {
    var elegidas = Object.keys(nr.elegidas), n = Math.max(1, diasEntre(nr.entrada, nr.salida)), total = 0;
    if (!elegidas.length) { $('#nResumen').innerHTML = '<p class="ayuda">Elige al menos una habitación.</p>'; return; }
    $('#nResumen').innerHTML = '<ul class="nr-lineas">' + elegidas.map(function (num) {
      var h = nr.H.habs.filter(function (x) { return x.numero === num; })[0], t = nr.H.tipos[h.tipo] || {};
      var precio = nr.precios[num] != null ? nr.precios[num] : tarifaPromedio(t.tarifa || 0, nr.entrada, nr.salida, nr.cat);
      nr.precios[num] = precio; total += precio * n;
      return '<li><div><b>Hab. ' + esc(num) + '</b><span>' + esc(t.nombre || '') + ' · ' + n + (n === 1 ? ' noche' : ' noches') + '</span></div>' +
        (nr.precioLibre ? '<input class="nr-precio" type="text" inputmode="decimal" data-n="' + esc(num) + '" value="' + precio + '" aria-label="Precio por noche de la ' + esc(num) + '">'
          : '<span>' + soles(precio) + ' × ' + n + '</span>') + '<b>' + soles(precio * n) + '</b></li>';
    }).join('') + '</ul><div class="nr-total"><span>Total</span><b>' + soles(total) + '</b></div>' +
      (nr.precioLibre ? '' : '<button type="button" class="btn btn-sm" id="nPrecio">Cambiar precio (pide clave)</button>');
    if (nr.precioLibre) {
      $('#nResumen').querySelectorAll('.nr-precio').forEach(function (i) {
        i.addEventListener('change', function () { var v = Number(i.value.replace(',', '.')); if (v >= 0) nr.precios[i.dataset.n] = v; pintarResumen(); });
      });
    } else {
      $('#nPrecio').addEventListener('click', function () { HS.conClave('Cambiar el precio', function () { nr.precioLibre = true; pintarResumen(); }); });
    }
  }

  function crearReserva() {
    var err = $('#nErr'); err.hidden = true;
    function mal(t) { err.textContent = t; err.hidden = false; }
    var elegidas = Object.keys(nr.elegidas);
    var nuevo = !$('#nFormCli').hidden;
    if (!nr.cliente && !nuevo) return mal('Elige o crea el cliente.');
    if (nuevo) {
      if (!$('#cNom').value.trim()) return mal('Escribe el nombre del cliente.');
      var td = $('#cTipo').value, doc = $('#cDoc').value.trim();
      if (td === '1' && !/^\d{8}$/.test(doc)) return mal('El DNI debe tener 8 números.');
      if (td === '6' && !/^(10|15|16|17|20)\d{9}$/.test(doc)) return mal('El RUC no es válido.');
      if (td !== '0' && !doc) return mal('Escribe el número de documento.');
    }
    if (!nr.salida || nr.salida <= nr.entrada) return mal('La salida debe ser después de la entrada.');
    if (!elegidas.length) return mal('Elige al menos una habitación.');
    var b = $('#nCrear'); b.disabled = true; b.textContent = 'Guardando…';
    var pCliente = nr.cliente ? Promise.resolve(nr.cliente) : q(sb.from('clientes').insert({
      tipo_doc: $('#cTipo').value, num_doc: $('#cDoc').value.trim() || null, nombre: $('#cNom').value.trim(),
      nacionalidad: $('#cNac').value.trim() || 'Perú', telefono: $('#cTel').value.trim() || null
    }).select(), { repetido: 'Ya hay un cliente con ese documento: búscalo arriba.', invalido: 'Revisa el documento del cliente.' }).then(function (f) { return f[0]; });
    pCliente.then(function (cli) {
      nr.cliente = cli;
      var filas = elegidas.map(function (num) {
        return {
          habitacion: num, cliente_id: cli.id, origen: $('#nOri').value || null, codigo_externo: $('#nExt').value.trim() || null,
          motivo: $('#nMot').value || null, entrada: nr.entrada, salida: nr.salida, tarifa: nr.precios[num],
          tarifa_nombre: nr.precioLibre ? 'Precio especial' : (temporadaDe(nr.entrada, nr.cat) || 'Regular'),
          personas: Math.max(1, Number($('#nPer').value) || 1), estado: $('#nEst').value, notas: $('#nNotas').value.trim() || null
        };
      });
      return q(sb.from('reservas').insert(filas).select(), { cruce: 'Otra reserva tomó esa habitación en esas fechas. Vuelve a elegir.' });
    }).then(function (creadas) {
      HS.aviso(creadas.length === 1 ? 'Reserva creada.' : creadas.length + ' reservas creadas.');
      HS.ir('#reserva/' + creadas[0].id);
    }).catch(function (e) { b.disabled = false; b.textContent = 'Crear reserva'; mal(e.mensaje); cargarLibres(); });
  }

  /* =================== Lista de reservas =================== */
  var FILTROS = [['activas', 'Activas'], ['llegan', 'Llegan hoy'], ['salen', 'Salen hoy'], ['finalizada', 'Finalizadas'], ['anulada', 'Anuladas'], ['todas', 'Todas']];
  var filtroRes = 'activas';

  function renderReservas() {
    $('#contenido').innerHTML = cabeza('Reservas', 'Busca por huésped, documento o habitación.',
      (puedeOperar() ? '<a class="btn" href="#clientes">Clientes</a><a class="btn btn-pri" href="#nueva">+ Nueva reserva</a>' : '')) +
      '<div class="filtros"><div class="segm" role="group" aria-label="Filtro">' + FILTROS.map(function (f) {
        return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (f[0] === filtroRes) + '">' + f[1] + '</button>';
      }).join('') + '</div><input id="rBus" type="search" placeholder="Buscar…" aria-label="Buscar reserva"></div><div id="rLista">' + vacio('Cargando…') + '</div>';
    $('#contenido').querySelectorAll('.segm button').forEach(function (b) {
      b.addEventListener('click', function () { filtroRes = b.dataset.f; renderReservas(); });
    });
    var hoy = HS.hoyLima(), c = sb.from('reservas').select('*');
    if (filtroRes === 'activas') c = c.in('estado', ACTIVAS);
    else if (filtroRes === 'llegan') c = c.eq('entrada', hoy).in('estado', ['reservado', 'confirmado']);
    else if (filtroRes === 'salen') c = c.eq('salida', hoy).eq('estado', 'ocupado');
    else if (filtroRes !== 'todas') c = c.eq('estado', filtroRes);
    q(c.order('entrada', { ascending: filtroRes === 'activas' || filtroRes === 'llegan' }).limit(300)).then(function (lista) {
      return clientesDe(lista.map(function (r) { return r.cliente_id; })).then(function (cli) {
        function pintar() {
          var t = $('#rBus').value.trim().toLowerCase();
          var vis = lista.filter(function (r) {
            var c = cli[r.cliente_id] || {};
            return !t || String(r.habitacion).toLowerCase().indexOf(t) >= 0 || String(c.nombre || '').toLowerCase().indexOf(t) >= 0 ||
              String(c.num_doc || '').indexOf(t) >= 0 || String(r.id) === t;
          });
          $('#rLista').innerHTML = vis.length ? '<div class="card"><table class="tabla"><thead><tr><th>Reserva</th><th>Huésped</th><th>Fechas</th><th>Estado</th></tr></thead><tbody>' +
            vis.map(function (r) {
              var c = cli[r.cliente_id] || {};
              return '<tr class="fila-link" data-id="' + r.id + '" tabindex="0"><td><b>Hab. ' + esc(r.habitacion) + '</b><small>#' + r.id + (r.origen ? ' · ' + esc(r.origen) : '') + '</small></td>' +
                '<td><b>' + esc(c.nombre || '—') + '</b><small>' + esc(docTxt(c)) + '</small></td>' +
                '<td class="c-dato" data-l="Fechas">' + fCorta(r.entrada) + ' → ' + fCorta(r.salida) + '<small>' + noches(r) + (noches(r) === 1 ? ' noche' : ' noches') + '</small></td>' +
                '<td class="c-pill">' + pillRes(r.estado) + '</td></tr>';
            }).join('') + '</tbody></table></div>' : vacio('No hay reservas con ese filtro.');
          $('#rLista').querySelectorAll('.fila-link').forEach(function (tr) {
            function ir() { HS.ir('#reserva/' + tr.dataset.id); }
            tr.addEventListener('click', ir);
            tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ir(); });
          });
        }
        $('#rBus').addEventListener('input', pintar);
        pintar();
      });
    }).catch(function (e) { $('#rLista').innerHTML = vacio(esc(e.mensaje)); });
  }

  /* =================== Ficha de la reserva =================== */
  function renderReserva(id) {
    $('#contenido').innerHTML = '<a class="volver" href="#reservas">← Reservas</a><div id="det">' + vacio('Cargando…') + '</div>';
    id = Number(id);
    if (!id) { $('#det').innerHTML = vacio('Reserva no encontrada.'); return; }
    Promise.all([
      q(sb.from('reservas').select('*').eq('id', id).maybeSingle()),
      q(sb.from('consumos').select('*').eq('reserva_id', id).order('creado_en')),
      q(sb.from('pagos').select('*').eq('reserva_id', id).order('creado_en')),
      HS.cargarHotel(), catalogos()
    ]).then(function (d) {
      var r = d[0]; if (!r) { $('#det').innerHTML = vacio('Reserva no encontrada.'); return; }
      var compIds = d[2].map(function (p) { return p.comprobante_id; }).filter(Boolean);
      return Promise.all([clientesDe([r.cliente_id, r.empresa_id]),
        compIds.length ? q(sb.from('comprobantes').select('*').in('id', compIds)).then(porId) : {}]).then(function (x) {
        pintarReserva({ r: r, consumos: d[1], pagos: d[2], H: d[3], cat: d[4], cli: x[0], comps: x[1] });
      });
    }).catch(function (e) { $('#det').innerHTML = vacio(esc(e.mensaje)); });
  }

  function cuentaDe(D) {
    var n = noches(D.r), hosp = n * Number(D.r.tarifa);
    var cons = D.consumos.filter(function (c) { return !c.anulado; }).reduce(function (s, c) { return s + c.cantidad * c.precio; }, 0);
    var pag = D.pagos.filter(function (p) { return !p.anulado; }).reduce(function (s, p) { return s + Number(p.monto); }, 0);
    var total = Math.round((hosp + cons) * 100) / 100;
    return { noches: n, hosp: hosp, cons: cons, total: total, pagado: pag, saldo: Math.round((total - pag) * 100) / 100 };
  }
  var EST_COMP = {
    pendiente: ['Enviando a SUNAT', 'r-res'], enviando: ['Enviando a SUNAT', 'r-res'], aceptado: ['Aceptado', 'e-on'], observado: ['Aceptado con obs.', 'e-on'],
    rechazado: ['Rechazado', 'r-anul'], error: ['Error', 'r-anul'], por_verificar: ['Verificando', 'r-res'], anulado: ['Anulado', 'e-off'],
    sin_internet: ['Sin internet', 'r-res'], interno: ['Interno', 'e-off']
  };
  HS.EST_COMP = EST_COMP;
  HS.pillComp = function (c) { var x = EST_COMP[c.estado] || [c.estado, 'e-off']; return '<span class="pill ' + x[1] + '">' + x[0] + '</span>'; };

  function pintarReserva(D) {
    var r = D.r, c = D.cli[r.cliente_id] || {}, k = cuentaDe(D), hoy = HS.hoyLima(), op = puedeOperar();
    var h = D.H.habs.filter(function (x) { return x.numero === r.habitacion; })[0] || {};
    var acciones = [];
    if (op) {
      if (r.estado === 'reservado') acciones.push(['confirmar', 'Confirmar', '']);
      if ((r.estado === 'reservado' || r.estado === 'confirmado') && r.entrada <= hoy) acciones.push(['checkin', 'Hacer check-in', 'btn-pri']);
      if (r.estado === 'ocupado') acciones.push(['consumo', '+ Consumo', ''], ['checkout', 'Hacer check-out', 'btn-pri']);
      if (k.saldo > 0 && r.estado !== 'anulada') acciones.push(['cobrar', 'Cobrar ' + soles(k.saldo), r.estado === 'ocupado' ? '' : 'btn-pri']);
      if (ACTIVAS.indexOf(r.estado) >= 0) acciones.push(['precio', 'Cambiar precio', ''], ['anular', 'Anular', 'btn-peligro-borde']);
    }
    $('#det').innerHTML =
      '<div class="cabeza"><div><h1>Hab. ' + esc(r.habitacion) + ' · ' + esc(c.nombre || 'Sin cliente') + '</h1>' +
        '<p class="sub">Reserva #' + r.id + ' · ' + esc(HS.nombreTipo(D.H, h.tipo)) + ' · ' + fCorta(r.entrada) + ' → ' + fCorta(r.salida) + ' · ' + k.noches + (k.noches === 1 ? ' noche' : ' noches') + ' · ' + r.personas + (r.personas === 1 ? ' persona' : ' personas') + '</p></div>' +
        pillRes(r.estado) + '</div>' +
      (acciones.length ? '<div class="acciones-res">' + acciones.map(function (a) { return '<button type="button" class="btn ' + a[2] + '" data-a="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' : '') +
      '<div class="det-grid">' +
        '<section class="card aj-sec"><h2>Cuenta</h2><ul class="cuenta">' +
          '<li><span>Hospedaje · ' + k.noches + ' × ' + soles(r.tarifa) + (r.tarifa_nombre && r.tarifa_nombre !== 'Regular' ? ' <small>(' + esc(r.tarifa_nombre) + ')</small>' : '') + '</span><b>' + soles(k.hosp) + '</b></li>' +
          D.consumos.map(function (x) {
            return '<li class="' + (x.anulado ? 'tachado' : '') + '"><span>' + esc(x.descripcion) + ' · ' + Number(x.cantidad) + ' × ' + soles(x.precio) + '</span><b>' + soles(x.cantidad * x.precio) + '</b>' +
              (op && !x.anulado && r.estado !== 'finalizada' ? '<button type="button" class="btn-icon" data-quitar="' + x.id + '" aria-label="Quitar consumo">✕</button>' : '') + '</li>';
          }).join('') +
          '<li class="total"><span>Total</span><b>' + soles(k.total) + '</b></li>' +
          '<li><span>Pagado</span><b>' + soles(k.pagado) + '</b></li>' +
          '<li class="saldo ' + (k.saldo > 0 ? 'debe' : 'ok') + '"><span>' + (k.saldo > 0 ? 'Saldo por cobrar' : (k.saldo < 0 ? 'A favor del huésped' : 'Pagado completo')) + '</span><b>' + soles(Math.abs(k.saldo)) + '</b></li>' +
        '</ul></section>' +
        '<section class="card aj-sec"><h2>Pagos y comprobantes</h2>' + (D.pagos.length ? '<ul class="pagos">' + D.pagos.map(function (p) {
          var cp = p.comprobante_id && D.comps[p.comprobante_id];
          return '<li><div><b>' + soles(p.monto) + '</b> · ' + esc(p.forma_pago) + ' · ' + (p.tipo === 'adelanto' ? 'Adelanto' : 'Pago') +
            '<small>' + HS.fecha(p.creado_en) + '</small></div><div class="pago-comp">' +
            (cp ? '<span>' + esc(cp.numero_completo || cp.serie) + '</span>' + HS.pillComp(cp) + (cp.enlace_pdf ? '<a class="btn btn-sm" href="' + esc(cp.enlace_pdf) + '" target="_blank" rel="noopener">PDF</a>' : '')
              : (op ? '<button type="button" class="btn btn-sm" data-emitir="' + p.id + '">Emitir comprobante</button>' : '<span class="ayuda">Sin comprobante</span>')) +
            '</div></li>';
        }).join('') + '</ul>' : '<p class="ayuda">Todavía no hay pagos.</p>') + '</section>' +
        '<section class="card aj-sec"><h2>Huésped</h2><ul class="datos">' +
          '<li><span>Documento</span><b>' + esc(docTxt(c)) + '</b></li><li><span>Nacionalidad</span><b>' + esc(c.nacionalidad || '—') + '</b></li>' +
          '<li><span>Teléfono</span><b>' + esc(c.telefono || '—') + '</b></li><li><span>Origen</span><b>' + esc(r.origen || '—') + (r.codigo_externo ? ' · ' + esc(r.codigo_externo) : '') + '</b></li>' +
          '<li><span>Motivo</span><b>' + esc(r.motivo || '—') + '</b></li>' +
          (r.checkin_en ? '<li><span>Check-in</span><b>' + HS.fecha(r.checkin_en) + '</b></li>' : '') +
          (r.checkout_en ? '<li><span>Check-out</span><b>' + HS.fecha(r.checkout_en) + '</b></li>' : '') +
          (r.notas ? '<li><span>Notas</span><b>' + esc(r.notas) + '</b></li>' : '') +
          (r.motivo_anulacion ? '<li><span>Motivo de anulación</span><b>' + esc(r.motivo_anulacion) + '</b></li>' : '') +
          (c.no_grato ? '<li class="t-dan"><span>Cliente</span><b>NO GRATO</b></li>' : '') +
        '</ul></section>' +
      '</div>';
    $('#det').querySelectorAll('[data-a]').forEach(function (b) { b.addEventListener('click', function () { ACCION[b.dataset.a](D, k); }); });
    $('#det').querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', function () {
        HS.conClave('Quitar un consumo', function () {
          HS.confirmar('Quitar consumo', 'El consumo queda tachado en la cuenta y en la auditoría.', 'Quitar', function () {
            return HS.qFilas(sb.from('consumos').update({ anulado: true }).eq('id', Number(b.dataset.quitar)).select())
              .then(function () { HS.aviso('Consumo quitado.'); renderReserva(r.id); });
          });
        });
      });
    });
    $('#det').querySelectorAll('[data-emitir]').forEach(function (b) {
      b.addEventListener('click', function () { modalComprobante(D, Number(b.dataset.emitir)); });
    });
  }

  function actualizar(D, cambios, msg) {
    return HS.qFilas(sb.from('reservas').update(cambios).eq('id', D.r.id).select()).then(function () { HS.aviso(msg); renderReserva(D.r.id); });
  }

  var ACCION = {
    confirmar: function (D) { actualizar(D, { estado: 'confirmado' }, 'Reserva confirmada.').catch(function (e) { HS.aviso(e.mensaje); }); },
    checkin: function (D) {
      HS.confirmar('Check-in · Hab. ' + D.r.habitacion, 'El huésped entra ahora. ¿Continuar?', 'Hacer check-in', function () {
        return actualizar(D, { estado: 'ocupado', checkin_en: new Date().toISOString() }, 'Check-in hecho.');
      });
    },
    checkout: function (D, k) {
      var hoy = HS.hoyLima();
      HS.confirmar('Check-out · Hab. ' + D.r.habitacion, (k.saldo > 0 ? '<b class="t-dan">Tiene un saldo de ' + soles(k.saldo) + ' sin cobrar.</b> ' : '') +
        'La habitación pasa a "Por limpiar".' + (D.r.salida > hoy ? ' Sale antes de lo previsto: la salida se cambia a hoy.' : ''), 'Hacer check-out', function () {
        var cambios = { estado: 'finalizada', checkout_en: new Date().toISOString() };
        if (D.r.salida > hoy) cambios.salida = hoy > D.r.entrada ? hoy : sumarDias(D.r.entrada, 1);
        return HS.qFilas(sb.from('reservas').update(cambios).eq('id', D.r.id).select()).then(function () {
          return sb.from('limpieza').insert({ habitacion: D.r.habitacion, tipo: 'Salida', estado: 'sucia' });   // si ya estaba por limpiar, no pasa nada
        }).then(function () { HS.aviso('Check-out hecho. Habitación por limpiar.'); renderReserva(D.r.id); });
      });
    },
    consumo: function (D) {
      q(sb.from('productos').select('*').eq('activo', true).order('categoria').order('nombre')).then(function (prods) {
        HS.abrirModal({
          titulo: 'Agregar consumo · Hab. ' + D.r.habitacion, ok: 'Agregar',
          cuerpo: (prods.length ? '<label>Producto<select id="kProd"><option value="">Otro (escribir)</option>' + prods.map(function (p) {
              return '<option value="' + p.id + '">' + esc(p.nombre) + ' · ' + soles(p.precio) + '</option>'; }).join('') + '</select></label>' : '') +
            '<label>Descripción<input id="kDesc" type="text" placeholder="Ej.: Lavandería 3 prendas"></label>' +
            '<div class="grid2"><label>Cantidad<input id="kCant" type="number" min="1" value="1"></label><label>Precio unitario (S/)<input id="kPre" type="text" inputmode="decimal"></label></div>',
          guardar: function () {
            var pid = prods.length ? $('#kProd').value : '', p = prods.filter(function (x) { return String(x.id) === pid; })[0];
            var desc = $('#kDesc').value.trim() || (p && p.nombre), cant = Number($('#kCant').value), pre = Number(($('#kPre').value || (p ? p.precio : '')).toString().replace(',', '.'));
            if (!desc) return Promise.reject({ mensaje: 'Elige un producto o escribe la descripción.' });
            if (!(cant > 0) || !(pre >= 0)) return Promise.reject({ mensaje: 'Revisa cantidad y precio.' });
            return q(sb.from('consumos').insert({ reserva_id: D.r.id, producto_id: p ? p.id : null, descripcion: desc, cantidad: cant, precio: pre, unidad: p ? p.unidad : 'ZZ' }).select())
              .then(function () { HS.aviso('Consumo agregado.'); renderReserva(D.r.id); });
          }
        });
        var sel = $('#kProd');
        if (sel) sel.addEventListener('change', function () { var p = prods.filter(function (x) { return String(x.id) === sel.value; })[0]; if (p) { $('#kDesc').value = p.nombre; $('#kPre').value = p.precio; } });
      }).catch(function (e) { HS.aviso(e.mensaje); });
    },
    cobrar: function (D, k) { modalCobro(D, k); },
    precio: function (D) {
      HS.conClave('Cambiar el precio de la reserva', function () {
        HS.abrirModal({
          titulo: 'Cambiar precio · Hab. ' + D.r.habitacion, ok: 'Guardar',
          cuerpo: '<label>Precio por noche (S/)<input id="kTar" type="text" inputmode="decimal" value="' + D.r.tarifa + '"></label>',
          guardar: function () {
            var v = Number($('#kTar').value.replace(',', '.'));
            if (!(v >= 0)) return Promise.reject({ mensaje: 'Escribe un precio válido.' });
            return actualizar(D, { tarifa: v, tarifa_nombre: 'Precio especial' }, 'Precio cambiado.');
          }
        });
      });
    },
    anular: function (D) {
      HS.conClave('Anular una reserva', function () {
        HS.abrirModal({
          titulo: 'Anular reserva #' + D.r.id, ok: 'Anular reserva', peligro: true,
          cuerpo: '<p>La habitación queda libre en esas fechas. Los pagos no se devuelven solos: si hay que devolver, hazlo en Ventas con una nota de crédito.</p><label>Motivo<input id="kMot" type="text"></label>',
          guardar: function () {
            if (!$('#kMot').value.trim()) return Promise.reject({ mensaje: 'Escribe el motivo.' });
            return actualizar(D, { estado: 'anulada', motivo_anulacion: $('#kMot').value.trim() }, 'Reserva anulada.');
          }
        });
      });
    }
  };

  /* ---- Cobro y comprobante ---- */
  function campoCliente(D, tipo) {
    var c = D.cli[D.r.cliente_id] || {}, e = D.cli[D.r.empresa_id] || {};
    if (tipo === 'factura') {
      return '<div class="grid2"><label>RUC<input id="pRuc" type="text" inputmode="numeric" maxlength="11" value="' + esc(e.num_doc || (c.tipo_doc === '6' ? c.num_doc : '')) + '"></label>' +
        '<label>Razón social<input id="pRaz" type="text" value="' + esc(e.nombre || (c.tipo_doc === '6' ? c.nombre : '')) + '"></label></div>' +
        '<label>Dirección fiscal<input id="pDir" type="text" value="' + esc(e.direccion || '') + '"></label>';
    }
    if (tipo === 'boleta') return '<p class="ayuda">A nombre de <b>' + esc(c.nombre || 'Clientes varios') + '</b> · ' + esc(docTxt(c)) + '</p>';
    if (tipo === 'nota_venta') return '<p class="ayuda">Nota de venta interna (NV01): no va a SUNAT.</p>';
    return '';
  }
  function datosCliente(D, tipo) {
    var c = D.cli[D.r.cliente_id] || {};
    if (tipo === 'factura') {
      var ruc = $('#pRuc').value.trim(), raz = $('#pRaz').value.trim();
      if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) throw { mensaje: 'El RUC no es válido (11 números).' };
      if (!raz) throw { mensaje: 'Escribe la razón social.' };
      return { tipo_doc: '6', num_doc: ruc, nombre: raz, direccion: $('#pDir').value.trim() || null };
    }
    return c.num_doc ? { tipo_doc: c.tipo_doc, num_doc: c.num_doc, nombre: c.nombre } : { tipo_doc: '0', num_doc: null, nombre: c.nombre || 'Clientes varios' };
  }

  function modalCobro(D, k) {
    var esAdelanto = D.r.estado === 'reservado' || D.r.estado === 'confirmado';
    HS.abrirModal({
      titulo: 'Cobrar · Hab. ' + D.r.habitacion, ok: 'Cobrar',
      cuerpo: '<div class="grid2"><label>Monto (S/)<input id="pMon" type="text" inputmode="decimal" value="' + k.saldo + '"></label>' +
        '<label>Forma de pago<select id="pFor">' + D.cat.formas.map(function (f) { return '<option>' + esc(f.nombre) + '</option>'; }).join('') + '</select></label></div>' +
        '<label>Comprobante<select id="pTipo"><option value="boleta">Boleta</option><option value="factura">Factura</option><option value="nota_venta">Nota de venta (interna)</option></select></label>' +
        '<div id="pCli">' + campoCliente(D, 'boleta') + '</div>' +
        (esAdelanto ? '<p class="ayuda">Se registra como <b>adelanto</b>.</p>' : ''),
      guardar: function () {
        var monto = Number($('#pMon').value.replace(',', '.')), tipo = $('#pTipo').value, forma = $('#pFor').value, cliente;
        if (!(monto > 0)) return Promise.reject({ mensaje: 'Escribe un monto mayor que cero.' });
        try { cliente = datosCliente(D, tipo); } catch (e) { return Promise.reject(e); }
        if (tipo === 'boleta' && monto > 700 && cliente.tipo_doc === '0') return Promise.reject({ mensaje: 'Una boleta de más de S/ 700 necesita el documento del cliente.' });
        return q(sb.from('caja_turnos').select('id').is('cerrado_en', null).limit(1)).then(function (t) {
          if (!t.length && forma === 'Efectivo') throw { mensaje: 'La caja está cerrada. Ábrela en Caja antes de cobrar en efectivo.' };
          return q(sb.from('pagos').insert({ reserva_id: D.r.id, turno_id: t.length ? t[0].id : null, forma_pago: forma, monto: monto, tipo: esAdelanto ? 'adelanto' : 'pago' }).select());
        }).then(function (p) { return emitir(p[0].id, tipo, cliente); }).then(function () { renderReserva(D.r.id); });
      }
    });
    $('#pTipo').addEventListener('change', function () { $('#pCli').innerHTML = campoCliente(D, $('#pTipo').value); });
  }

  function modalComprobante(D, pagoId) {
    HS.abrirModal({
      titulo: 'Emitir comprobante', ok: 'Emitir',
      cuerpo: '<label>Comprobante<select id="pTipo"><option value="boleta">Boleta</option><option value="factura">Factura</option><option value="nota_venta">Nota de venta (interna)</option></select></label><div id="pCli">' + campoCliente(D, 'boleta') + '</div>',
      guardar: function () {
        var tipo = $('#pTipo').value, cliente;
        try { cliente = datosCliente(D, tipo); } catch (e) { return Promise.reject(e); }
        return emitir(pagoId, tipo, cliente).then(function () { renderReserva(D.r.id); });
      }
    });
    $('#pTipo').addEventListener('change', function () { $('#pCli').innerHTML = campoCliente(D, $('#pTipo').value); });
  }

  // Llama a la función del servidor que emite en Nooki (o numera la nota de venta)
  function emitir(pagoId, tipo, cliente) {
    return HS.facturar({ accion: 'emitir', pago_id: pagoId, tipo: tipo, cliente: cliente }).then(function (r) {
      var c = r.comprobante || {};
      HS.aviso(c.estado === 'aceptado' || c.estado === 'observado' ? 'Cobrado. ' + (c.numero_completo || '') + ' aceptado por SUNAT.'
        : c.estado === 'interno' ? 'Cobrado. Nota de venta ' + (c.numero_completo || '') + '.'
        : 'Cobrado. Comprobante: ' + ((EST_COMP[c.estado] || [c.estado])[0] || 'pendiente') + (c.mensaje_sunat ? ' · ' + c.mensaje_sunat : '') + '.');
    }, function (e) {
      HS.aviso('El pago quedó guardado, pero el comprobante no se emitió: ' + e.mensaje + ' Puedes emitirlo después desde la reserva.');
    });
  }

  /* =================== Clientes =================== */
  function renderClientes() {
    $('#contenido').innerHTML = cabeza('Clientes', 'Huéspedes y empresas. Sus datos son personales: no los compartas.',
      '<button class="btn btn-pri" type="button" id="cNuevo">+ Cliente nuevo</button>') +
      '<div class="filtros"><input id="cBus" type="search" placeholder="Buscar por nombre o documento" aria-label="Buscar cliente"></div><div id="cLista">' + vacio('Cargando…') + '</div>';
    $('#cNuevo').addEventListener('click', function () { modalCliente(null); });
    var t;
    $('#cBus').addEventListener('input', function () { clearTimeout(t); t = setTimeout(cargarClientes, 250); });
    cargarClientes();
  }
  function cargarClientes() {
    var t = ($('#cBus') || {}).value || '', c = sb.from('clientes').select('*');
    if (t.trim()) c = /^\d{3,}$/.test(t.trim()) ? c.like('num_doc', t.trim() + '%') : c.ilike('nombre', '%' + t.trim() + '%');
    q(c.order('nombre').limit(200)).then(function (lista) {
      $('#cLista').innerHTML = lista.length ? '<div class="card"><table class="tabla"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Nacionalidad</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
        lista.map(function (c) {
          return '<tr data-id="' + c.id + '"><td><b>' + esc(c.nombre) + '</b><small>' + esc(docTxt(c)) + '</small></td>' +
            '<td class="c-dato" data-l="Teléfono">' + esc(c.telefono || '—') + '</td><td class="c-dato" data-l="País">' + esc(c.nacionalidad || '—') + '</td>' +
            '<td><div class="acciones">' + (c.no_grato ? '<span class="pill r-anul">No grato</span>' : '') + '<button class="btn btn-sm" type="button">Editar</button></div></td></tr>';
        }).join('') + '</tbody></table></div>' : vacio('No hay clientes con ese dato.');
      $('#cLista').querySelectorAll('tr[data-id] button').forEach(function (b) {
        b.addEventListener('click', function () { modalCliente(lista.filter(function (c) { return String(c.id) === b.closest('tr').dataset.id; })[0]); });
      });
    }).catch(function (e) { $('#cLista').innerHTML = vacio(esc(e.mensaje)); });
  }
  function modalCliente(c) {
    c = c || {};
    HS.abrirModal({
      titulo: c.id ? 'Editar cliente' : 'Cliente nuevo', ok: 'Guardar',
      cuerpo: '<div class="grid2"><label>Documento<select id="cTipo">' + Object.keys(DOCS).map(function (k) { return '<option value="' + k + '"' + (k === (c.tipo_doc || '1') ? ' selected' : '') + '>' + DOCS[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Número<input id="cDoc" type="text" value="' + esc(c.num_doc || '') + '"></label></div>' +
        '<label>Nombre completo o razón social<input id="cNom" type="text" value="' + esc(c.nombre || '') + '"></label>' +
        '<div class="grid2"><label>Nacionalidad<input id="cNac" type="text" value="' + esc(c.nacionalidad || 'Perú') + '"></label><label>Teléfono<input id="cTel" type="tel" value="' + esc(c.telefono || '') + '"></label></div>' +
        '<div class="grid2"><label>Correo<input id="cCor" type="email" value="' + esc(c.correo || '') + '"></label><label>Dirección<input id="cDir" type="text" value="' + esc(c.direccion || '') + '"></label></div>' +
        '<label class="check"><input id="cNg" type="checkbox"' + (c.no_grato ? ' checked' : '') + '> Cliente no grato</label>' +
        '<label>Motivo (si es no grato)<input id="cNgM" type="text" value="' + esc(c.motivo_no_grato || '') + '"></label>',
      guardar: function () {
        var td = $('#cTipo').value, doc = $('#cDoc').value.trim();
        if (!$('#cNom').value.trim()) return Promise.reject({ mensaje: 'Escribe el nombre.' });
        if (td === '1' && !/^\d{8}$/.test(doc)) return Promise.reject({ mensaje: 'El DNI debe tener 8 números.' });
        if (td === '6' && !/^(10|15|16|17|20)\d{9}$/.test(doc)) return Promise.reject({ mensaje: 'El RUC no es válido.' });
        var d = { tipo_doc: td, num_doc: doc || null, nombre: $('#cNom').value.trim(), nacionalidad: $('#cNac').value.trim() || 'Perú',
          telefono: $('#cTel').value.trim() || null, correo: $('#cCor').value.trim() || null, direccion: $('#cDir').value.trim() || null,
          no_grato: $('#cNg').checked, motivo_no_grato: $('#cNgM').value.trim() || null };
        var ctx = { repetido: 'Ya hay un cliente con ese documento.', invalido: 'Revisa el documento.' };
        return (c.id ? HS.qFilas(sb.from('clientes').update(d).eq('id', c.id).select(), ctx) : q(sb.from('clientes').insert(d).select(), ctx))
          .then(function () { HS.aviso('Cliente guardado.'); cargarClientes(); });
      }
    });
  }

  /* =================== Registro =================== */
  HS.vista('panel', { l: 'Panel', roles: TODOS, render: renderPanel, orden: 10 });
  HS.vista('reservas', { l: 'Reservas', roles: TODOS, render: renderReservas, orden: 20 });
  HS.vista('nueva', { l: 'Nueva reserva', roles: OPERAN, render: renderNueva, menu: false, padre: 'reservas' });
  HS.vista('reserva', { l: 'Reserva', roles: TODOS, render: renderReserva, menu: false, padre: 'reservas' });
  HS.vista('clientes', { l: 'Clientes', roles: OPERAN, render: renderClientes, menu: false, padre: 'reservas' });
  ['panel', 'nueva', 'reservas', 'clientes'].forEach(HS.conectar);
  HS.reservas = { fCorta: fCorta, noches: noches, pillRes: pillRes, sumarDias: sumarDias, clientesDe: clientesDe, docTxt: docTxt, cabeza: cabeza, vacio: vacio, porId: porId };
})();
