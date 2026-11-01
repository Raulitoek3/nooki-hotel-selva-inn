/* Hotel Selva Inn · Caja: abrir, ingresos y salidas, arqueo y cierre */
(function () {
  'use strict';
  var HS = window.HS, sb = HS.sb, $ = HS.$, esc = HS.esc, q = HS.q, soles = HS.soles, R = HS.reservas;

  function esEfectivo(f) { return !f || /efectivo/i.test(f); }
  function suma(l, f) { return Math.round(l.reduce(function (s, x) { return s + Number(f(x)); }, 0) * 100) / 100; }

  function renderCaja() {
    var op = HS.yo().rol !== 'dueno';
    $('#contenido').innerHTML = R.cabeza('Caja', 'Abre la caja al empezar el turno y ciérrala contando el efectivo.') + '<div id="cj">' + R.vacio('Cargando…') + '</div>';
    q(sb.from('caja_turnos').select('*').order('abierto_en', { ascending: false }).limit(15)).then(function (turnos) {
      var abierto = turnos.filter(function (t) { return !t.cerrado_en; })[0];
      var hist = turnos.filter(function (t) { return t.cerrado_en; });
      var historial = '<section class="card aj-sec"><h2>Turnos anteriores</h2>' + (hist.length ? '<table class="tabla"><thead><tr><th>Responsable</th><th>Abrió</th><th>Cerró</th><th>Inicial</th><th>Contado</th></tr></thead><tbody>' +
        hist.map(function (t) {
          return '<tr><td><b>' + esc(t.responsable) + '</b></td><td class="c-dato" data-l="Abrió">' + HS.fecha(t.abierto_en) + '</td><td class="c-dato" data-l="Cerró">' + HS.fecha(t.cerrado_en) + '</td>' +
            '<td class="c-dato" data-l="Inicial">' + soles(t.monto_inicial) + '</td><td class="c-dato" data-l="Contado">' + soles(t.contado) + (t.notas ? '<small>' + esc(t.notas) + '</small>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="ayuda">Todavía no hay turnos cerrados.</p>') + '</section>';
      if (!abierto) {
        $('#cj').innerHTML = (op ? '<form class="card aj-sec angosto" id="fAbrir" novalidate><h2>La caja está cerrada</h2>' +
          '<p class="ayuda">Para cobrar en efectivo hay que abrirla.</p>' +
          '<div class="grid2"><label>Responsable<input id="aRes" type="text" value="' + esc(HS.yo().nombre) + '"></label>' +
          '<label>Monto inicial (S/)<input id="aMon" type="text" inputmode="decimal" value="0"></label></div>' +
          '<p class="err" id="aErr" hidden></p><div class="aj-pie"><button class="btn btn-pri" type="submit">Abrir caja</button></div></form>'
          : '<div class="card vacio">La caja está cerrada.</div>') + historial;
        if (op) $('#fAbrir').addEventListener('submit', function (ev) {
          ev.preventDefault();
          var m = Number($('#aMon').value.replace(',', '.'));
          if (!$('#aRes').value.trim() || !(m >= 0)) { $('#aErr').textContent = 'Escribe el responsable y un monto válido.'; $('#aErr').hidden = false; return; }
          q(sb.from('caja_turnos').insert({ responsable: $('#aRes').value.trim(), monto_inicial: m }).select(), { repetido: 'Ya hay una caja abierta.' })
            .then(function () { HS.aviso('Caja abierta.'); renderCaja(); })
            .catch(function (e) { $('#aErr').textContent = e.mensaje; $('#aErr').hidden = false; });
        });
        return;
      }
      return Promise.all([
        q(sb.from('pagos').select('*').eq('turno_id', abierto.id).eq('anulado', false)),
        q(sb.from('caja_movimientos').select('*').eq('turno_id', abierto.id).order('creado_en'))
      ]).then(function (d) {
        var pagos = d[0], movs = d[1];
        var porForma = {};
        pagos.forEach(function (p) { porForma[p.forma_pago] = (porForma[p.forma_pago] || 0) + Number(p.monto); });
        var efectivoCobros = suma(pagos.filter(function (p) { return esEfectivo(p.forma_pago); }), function (p) { return p.monto; });
        var ing = suma(movs.filter(function (m) { return m.tipo === 'ingreso' && esEfectivo(m.forma_pago); }), function (m) { return m.monto; });
        var sal = suma(movs.filter(function (m) { return m.tipo === 'salida' && esEfectivo(m.forma_pago); }), function (m) { return m.monto; });
        var esperado = Math.round((Number(abierto.monto_inicial) + efectivoCobros + ing - sal) * 100) / 100;
        $('#cj').innerHTML =
          '<div class="kpis">' +
            '<div class="card kpi"><b>' + soles(abierto.monto_inicial) + '</b><span>Monto inicial</span></div>' +
            '<div class="card kpi h-libre"><b>' + soles(efectivoCobros) + '</b><span>Cobrado en efectivo</span></div>' +
            '<div class="card kpi"><b>' + soles(ing) + ' / ' + soles(sal) + '</b><span>Ingresos / salidas</span></div>' +
            '<div class="card kpi h-occ"><b>' + soles(esperado) + '</b><span>Debe haber en caja</span></div>' +
          '</div>' +
          '<div class="acciones-res"><span class="pill e-on">Abierta por ' + esc(abierto.responsable) + ' · ' + HS.fecha(abierto.abierto_en) + '</span>' +
          (op ? '<button class="btn" type="button" id="bIng">+ Ingreso</button><button class="btn" type="button" id="bSal">− Salida</button><button class="btn btn-pri" type="button" id="bCerrar">Cerrar caja</button>' : '') + '</div>' +
          '<div class="det-grid">' +
            '<section class="card aj-sec"><h2>Cobros del turno por forma de pago</h2>' + (Object.keys(porForma).length ? '<ul class="cuenta">' +
              Object.keys(porForma).map(function (f) { return '<li><span>' + esc(f) + '</span><b>' + soles(porForma[f]) + '</b></li>'; }).join('') +
              '<li class="total"><span>Total cobrado</span><b>' + soles(suma(pagos, function (p) { return p.monto; })) + '</b></li></ul>' : '<p class="ayuda">Todavía no hay cobros en este turno.</p>') + '</section>' +
            '<section class="card aj-sec"><h2>Ingresos y salidas</h2>' + (movs.length ? '<ul class="cuenta">' + movs.map(function (m) {
              return '<li><span>' + (m.tipo === 'ingreso' ? '+ ' : '− ') + esc(m.motivo) + (m.descripcion ? ' · ' + esc(m.descripcion) : '') + '<small>' + HS.fecha(m.creado_en) + (m.forma_pago && !esEfectivo(m.forma_pago) ? ' · ' + esc(m.forma_pago) : '') + '</small></span><b>' + soles(m.monto) + '</b></li>';
            }).join('') + '</ul>' : '<p class="ayuda">Sin movimientos.</p>') + '</section>' +
          '</div>' + historial;
        if (!op) return;
        $('#bIng').addEventListener('click', function () { modalMov(abierto, 'ingreso'); });
        $('#bSal').addEventListener('click', function () { modalMov(abierto, 'salida'); });
        $('#bCerrar').addEventListener('click', function () { modalCerrar(abierto, esperado); });
      });
    }).catch(function (e) { $('#cj').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  function modalMov(turno, tipo) {
    Promise.all([q(sb.from('motivos_caja').select('*').eq('tipo', tipo).eq('activo', true)), q(sb.from('formas_pago').select('*').eq('activa', true).order('orden'))]).then(function (d) {
      HS.abrirModal({
        titulo: tipo === 'ingreso' ? 'Ingreso de dinero' : 'Salida de dinero', ok: 'Guardar',
        cuerpo: '<label>Motivo<input id="mMot" type="text" list="mMotL" placeholder="' + (tipo === 'ingreso' ? 'Ej.: Sencillo para cambio' : 'Ej.: Compra de útiles de limpieza') + '"></label>' +
          '<datalist id="mMotL">' + d[0].map(function (m) { return '<option value="' + esc(m.nombre) + '">'; }).join('') + '</datalist>' +
          '<div class="grid2"><label>Monto (S/)<input id="mMon" type="text" inputmode="decimal"></label>' +
          '<label>Forma<select id="mFor">' + d[1].map(function (f) { return '<option>' + esc(f.nombre) + '</option>'; }).join('') + '</select></label></div>' +
          '<label>Detalle<input id="mDet" type="text" placeholder="Opcional"></label>',
        guardar: function () {
          var m = Number($('#mMon').value.replace(',', '.'));
          if (!$('#mMot').value.trim()) return Promise.reject({ mensaje: 'Escribe el motivo.' });
          if (!(m > 0)) return Promise.reject({ mensaje: 'Escribe un monto mayor que cero.' });
          return q(sb.from('caja_movimientos').insert({ turno_id: turno.id, tipo: tipo, motivo: $('#mMot').value.trim(), monto: m,
            forma_pago: $('#mFor').value, descripcion: $('#mDet').value.trim() || null }).select())
            .then(function () { HS.aviso(tipo === 'ingreso' ? 'Ingreso guardado.' : 'Salida guardada.'); renderCaja(); });
        }
      });
    }).catch(function (e) { HS.aviso(e.mensaje); });
  }

  function modalCerrar(turno, esperado) {
    HS.abrirModal({
      titulo: 'Cerrar caja', ok: 'Cerrar caja',
      cuerpo: '<p>Debe haber <b>' + soles(esperado) + '</b> en efectivo.</p><label>Efectivo contado (S/)<input id="kCon" type="text" inputmode="decimal"></label>' +
        '<p class="ayuda" id="kDif"></p><label>Notas<input id="kNot" type="text" placeholder="Opcional"></label>',
      guardar: function () {
        var c = Number($('#kCon').value.replace(',', '.'));
        if (!($('#kCon').value.trim() !== '' && c >= 0)) return Promise.reject({ mensaje: 'Escribe cuánto efectivo contaste.' });
        var dif = Math.round((c - esperado) * 100) / 100;
        var nota = (dif === 0 ? 'Cuadra' : dif < 0 ? 'Falta ' + soles(-dif) : 'Sobra ' + soles(dif)) + ($('#kNot').value.trim() ? ' · ' + $('#kNot').value.trim() : '');
        return HS.qFilas(sb.from('caja_turnos').update({ cerrado_en: new Date().toISOString(), contado: c, notas: nota }).eq('id', turno.id).select())
          .then(function () { HS.aviso('Caja cerrada · ' + nota.split(' · ')[0] + '.'); renderCaja(); });
      }
    });
    $('#kCon').addEventListener('input', function () {
      var c = Number($('#kCon').value.replace(',', '.')), dif = Math.round((c - esperado) * 100) / 100;
      $('#kDif').textContent = $('#kCon').value.trim() === '' || isNaN(c) ? '' : dif === 0 ? 'Cuadra.' : dif < 0 ? 'Falta ' + soles(-dif) + '.' : 'Sobra ' + soles(dif) + '.';
    });
  }

  HS.vista('caja', { l: 'Caja', roles: ['admin', 'recepcion', 'dueno'], render: renderCaja, orden: 30 });
  HS.conectar('caja');
})();
