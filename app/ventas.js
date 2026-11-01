/* Hotel Selva Inn · Ventas: comprobantes, estado SUNAT, PDF, WhatsApp, consultar, reenviar y anular */
(function () {
  'use strict';
  var HS = window.HS, sb = HS.sb, $ = HS.$, esc = HS.esc, q = HS.q, soles = HS.soles, R = HS.reservas;
  var TIPOS = { boleta: 'Boleta', factura: 'Factura', nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito', nota_venta: 'Nota de venta' };
  var PERIODOS = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];
  var periodo = 'hoy';

  function desdeIso(p) {
    if (p === 'todo') return null;
    var hoy = HS.hoyLima(), n = p === 'hoy' ? 0 : Number(p) - 1;
    return R.sumarDias(hoy, -n) + 'T00:00:00-05:00';
  }

  function renderVentas() {
    var op = HS.yo().rol !== 'dueno';
    $('#contenido').innerHTML = R.cabeza('Ventas', 'Comprobantes emitidos y su estado en SUNAT.') +
      '<div class="filtros"><div class="segm" role="group" aria-label="Período">' + PERIODOS.map(function (p) {
        return '<button type="button" data-p="' + p[0] + '" aria-pressed="' + (p[0] === periodo) + '">' + p[1] + '</button>';
      }).join('') + '</div></div><div id="vLista">' + R.vacio('Cargando…') + '</div>';
    $('#contenido').querySelectorAll('.segm button').forEach(function (b) { b.addEventListener('click', function () { periodo = b.dataset.p; renderVentas(); }); });
    var c = sb.from('comprobantes').select('*'), d = desdeIso(periodo);
    if (d) c = c.gte('emitido_en', d);
    q(c.order('emitido_en', { ascending: false }).limit(300)).then(function (lista) {
      var validos = lista.filter(function (x) { return ['aceptado', 'observado', 'interno'].indexOf(x.estado) >= 0 && x.tipo !== 'nota_credito'; });
      var nc = lista.filter(function (x) { return x.tipo === 'nota_credito' && ['aceptado', 'observado'].indexOf(x.estado) >= 0; });
      var total = validos.reduce(function (s, x) { return s + Number(x.total); }, 0) - nc.reduce(function (s, x) { return s + Number(x.total); }, 0);
      var pend = lista.filter(function (x) { return ['pendiente', 'enviando', 'por_verificar', 'sin_internet', 'error', 'rechazado'].indexOf(x.estado) >= 0; }).length;
      $('#vLista').innerHTML =
        '<div class="kpis"><div class="card kpi h-libre"><b>' + soles(total) + '</b><span>Vendido (válidos)</span></div>' +
        '<div class="card kpi"><b>' + lista.length + '</b><span>Comprobantes</span></div>' +
        '<div class="card kpi ' + (pend ? 'h-sale' : '') + '"><b>' + pend + '</b><span>Por revisar</span></div></div>' +
        (lista.length ? '<div class="card"><table class="tabla"><thead><tr><th>Comprobante</th><th>Cliente</th><th>Total</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
          lista.map(function (x) {
            var acc = [];
            if (x.enlace_pdf) acc.push('<a class="btn btn-sm" href="' + esc(x.enlace_pdf) + '" target="_blank" rel="noopener">PDF</a>');
            if (x.enlace_pdf) acc.push('<button class="btn btn-sm" type="button" data-a="wa">WhatsApp</button>');
            if (op && ['pendiente', 'enviando', 'por_verificar'].indexOf(x.estado) >= 0) acc.push('<button class="btn btn-sm" type="button" data-a="consultar">Consultar</button>');
            if (op && ['error', 'sin_internet'].indexOf(x.estado) >= 0) acc.push('<button class="btn btn-sm" type="button" data-a="reenviar">Reenviar</button>');
            if (op && ['aceptado', 'observado'].indexOf(x.estado) >= 0 && (x.tipo === 'boleta' || x.tipo === 'factura')) acc.push('<button class="btn btn-sm" type="button" data-a="anular">Anular</button>');
            return '<tr data-id="' + x.id + '"><td><b>' + esc(x.numero_completo || x.serie + '-…') + '</b><small>' + esc(TIPOS[x.tipo] || x.tipo) + ' · ' + HS.fecha(x.emitido_en) + '</small></td>' +
              '<td><b>' + esc(x.cliente_nombre || 'Clientes varios') + '</b><small>' + esc(x.cliente_num_doc || '') + '</small></td>' +
              '<td class="c-dato" data-l="Total">' + soles(x.total) + '</td>' +
              '<td class="c-pill">' + HS.pillComp(x) + (x.mensaje_sunat && ['aceptado', 'interno'].indexOf(x.estado) < 0 ? '<small>' + esc(x.mensaje_sunat) + '</small>' : '') + '</td>' +
              '<td><div class="acciones">' + acc.join('') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>' : R.vacio('No hay comprobantes en este período.'));
      $('#vLista').querySelectorAll('[data-a]').forEach(function (b) {
        var x = lista.filter(function (y) { return String(y.id) === b.closest('tr').dataset.id; })[0];
        b.addEventListener('click', function () { ACC[b.dataset.a](x, b); });
      });
    }).catch(function (e) { $('#vLista').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  var ACC = {
    wa: function (x) {
      HS.abrirModal({
        titulo: 'Enviar por WhatsApp', ok: 'Abrir WhatsApp',
        cuerpo: '<label>Celular del cliente (con código de país)<input id="wTel" type="tel" value="51" inputmode="tel"></label>',
        guardar: function () {
          var tel = $('#wTel').value.replace(/\D/g, '');
          if (tel.length < 9) return Promise.reject({ mensaje: 'Escribe el número completo, por ejemplo 51987654321.' });
          var txt = 'Hola, le enviamos su comprobante ' + (x.numero_completo || '') + ' del Hotel Selva Inn: ' + x.enlace_pdf;
          window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
          return Promise.resolve();
        }
      });
    },
    consultar: function (x, b) { b.disabled = true; HS.facturar({ accion: 'consultar', comprobante_id: x.id }).then(fin('Estado actualizado.'), falla(b)); },
    reenviar: function (x, b) { b.disabled = true; HS.facturar({ accion: 'reenviar', comprobante_id: x.id }).then(fin('Reenviado.'), falla(b)); },
    anular: function (x) {
      HS.conClave('Anular un comprobante', function () {
        HS.abrirModal({
          titulo: 'Anular ' + (x.numero_completo || ''), ok: 'Anular en SUNAT', peligro: true,
          cuerpo: '<p>Se pide la baja a SUNAT. Solo se puede dentro de los 7 días y si no tiene nota de crédito.</p><label>Motivo<input id="aMot" type="text" placeholder="Ej.: Error en el RUC del cliente"></label>',
          guardar: function () {
            if (!$('#aMot').value.trim()) return Promise.reject({ mensaje: 'Escribe el motivo.' });
            return HS.facturar({ accion: 'anular', comprobante_id: x.id, motivo: $('#aMot').value.trim() }).then(fin('Anulación enviada a SUNAT.'));
          }
        });
      });
    }
  };
  function fin(msg) { return function () { HS.aviso(msg); renderVentas(); }; }
  function falla(b) { return function (e) { b.disabled = false; HS.aviso(e.mensaje); }; }

  HS.vista('ventas', { l: 'Ventas', roles: ['admin', 'recepcion', 'dueno'], render: renderVentas, orden: 35 });
  HS.conectar('ventas');
})();
