/* Hotel Selva Inn · Limpieza, Auditoría, Reportes y pestañas simples de Ajustes */
(function () {
  'use strict';
  var HS = window.HS, sb = HS.sb, $ = HS.$, esc = HS.esc, q = HS.q, soles = HS.soles, R = HS.reservas;
  var TODOS = ['admin', 'recepcion', 'dueno'];
  function op() { return HS.yo().rol !== 'dueno'; }

  /* =================== Limpieza =================== */
  var COLS = [['sucia', 'Por limpiar', 'h-limpia'], ['limpiando', 'Limpiando', 'h-res'], ['revisar', 'Por revisar', 'h-occ']];
  var SIG = { sucia: ['limpiando', 'Empezar'], limpiando: ['revisar', 'Terminé'], revisar: ['lista', 'Revisada: lista'] };

  function renderLimpieza() {
    $('#contenido').innerHTML = R.cabeza('Limpieza', 'Habitaciones por limpiar, en limpieza y por revisar.',
      op() ? '<button class="btn btn-pri" type="button" id="lNueva">+ Mandar a limpiar</button>' : '') + '<div id="lz">' + R.vacio('Cargando…') + '</div>';
    if (op()) $('#lNueva').addEventListener('click', modalMandar);
    var hoy = HS.hoyLima();
    Promise.all([
      q(sb.from('limpieza').select('*').neq('estado', 'lista').order('desde')),
      q(sb.from('limpieza').select('*').eq('estado', 'lista').gte('terminado_en', hoy + 'T00:00:00-05:00').order('terminado_en', { ascending: false })),
      q(sb.from('personal').select('*').eq('activo', true).order('nombre'))
    ]).then(function (d) {
      var pend = d[0], listas = d[1], pers = HS.reservas.porId(d[2]);
      $('#lz').innerHTML = '<div class="tablero">' + COLS.map(function (c) {
        var items = pend.filter(function (l) { return l.estado === c[0]; });
        return '<section class="card col-limp"><h2>' + c[1] + ' <span class="chip">' + items.length + '</span></h2>' + (items.length ? items.map(function (l) {
          var p = pers[l.personal_id];
          return '<div class="tarea ' + c[2] + '" data-id="' + l.id + '"><div><b>Hab. ' + esc(l.habitacion) + '</b><span>' + esc(l.tipo) + ' · desde ' + HS.fecha(l.desde).split(' · ')[1] + '</span>' +
            '<span>' + (p ? 'Camarera: ' + esc(p.nombre) : 'Sin asignar') + '</span></div>' +
            (op() ? '<div class="acciones">' + (d[2].length ? '<button class="btn btn-sm" type="button" data-a="asignar">Asignar</button>' : '') +
              '<button class="btn btn-sm btn-pri" type="button" data-a="avanzar">' + SIG[l.estado][1] + '</button></div>' : '') + '</div>';
        }).join('') : '<p class="ayuda">Nada aquí.</p>') + '</section>';
      }).join('') + '</div>' +
      '<section class="card aj-sec"><h2>Listas hoy (' + listas.length + ')</h2>' + (listas.length ? '<div class="op-tipos">' + listas.map(function (l) {
        return '<span class="chip">Hab. ' + esc(l.habitacion) + ' · ' + HS.fecha(l.terminado_en).split(' · ')[1] + (pers[l.personal_id] ? ' · ' + esc(pers[l.personal_id].nombre) : '') + '</span>';
      }).join('') + '</div>' : '<p class="ayuda">Todavía ninguna.</p>') +
      (!d[2].length && op() ? '<p class="ayuda">Para asignar camareras, agrégalas en Ajustes → Personal.</p>' : '') + '</section>';
      $('#lz').querySelectorAll('[data-a]').forEach(function (b) {
        var l = pend.filter(function (x) { return String(x.id) === b.closest('.tarea').dataset.id; })[0];
        b.addEventListener('click', function () {
          if (b.dataset.a === 'avanzar') {
            var nuevo = SIG[l.estado][0], cambios = { estado: nuevo };
            if (nuevo === 'lista') cambios.terminado_en = new Date().toISOString();
            HS.qFilas(sb.from('limpieza').update(cambios).eq('id', l.id).select()).then(function () { HS.aviso(nuevo === 'lista' ? 'Hab. ' + l.habitacion + ' lista para vender.' : 'Actualizado.'); renderLimpieza(); }, function (e) { HS.aviso(e.mensaje); });
          } else {
            HS.abrirModal({
              titulo: 'Asignar · Hab. ' + l.habitacion, ok: 'Asignar',
              cuerpo: '<label>Camarera<select id="lPer">' + d[2].map(function (p) { return '<option value="' + p.id + '"' + (p.id === l.personal_id ? ' selected' : '') + '>' + esc(p.nombre) + ' · ' + esc(p.cargo) + '</option>'; }).join('') + '</select></label>',
              guardar: function () { return HS.qFilas(sb.from('limpieza').update({ personal_id: Number($('#lPer').value) }).eq('id', l.id).select()).then(function () { HS.aviso('Asignado.'); renderLimpieza(); }); }
            });
          }
        });
      });
    }).catch(function (e) { $('#lz').innerHTML = R.vacio(esc(e.mensaje)); });
  }
  function modalMandar() {
    HS.cargarHotel().then(function (H) {
      HS.abrirModal({
        titulo: 'Mandar a limpiar', ok: 'Mandar',
        cuerpo: '<label>Habitación<select id="lHab">' + H.habs.map(function (h) { return '<option>' + esc(h.numero) + '</option>'; }).join('') + '</select></label>' +
          '<label>Tipo<select id="lTipo"><option>Repaso</option><option>Salida</option><option>Retoque</option></select></label>',
        guardar: function () {
          return q(sb.from('limpieza').insert({ habitacion: $('#lHab').value, tipo: $('#lTipo').value, estado: 'sucia' }).select(), { repetido: 'Esa habitación ya está en limpieza.' })
            .then(function () { HS.aviso('Enviada a limpieza.'); renderLimpieza(); });
        }
      });
    });
  }

  /* =================== Auditoría =================== */
  function renderAuditoria() {
    $('#contenido').innerHTML = R.cabeza('Auditoría', 'Todo lo que pasa en el sistema, con fecha y hora. No se puede editar ni borrar.') + '<div id="au">' + R.vacio('Cargando…') + '</div>';
    if (HS.yo().rol === 'recepcion') {
      q(sb.rpc('admin_abierto')).then(function (abierta) {
        if (abierta) { cargarAuditoria(); return; }
        $('#au').innerHTML = '<div class="card candado"><h2>Auditoría pide la clave de administrador</h2><button class="btn btn-pri" type="button" id="auAbrir">Abrir con la clave</button></div>';
        $('#auAbrir').addEventListener('click', function () { HS.conClave('Ver la auditoría', cargarAuditoria); });
      });
    } else cargarAuditoria();
  }
  function cargarAuditoria() {
    Promise.all([q(sb.from('auditoria').select('*').order('creado_en', { ascending: false }).limit(300)), q(sb.from('usuarios').select('id, nombre'))]).then(function (d) {
      var lista = d[0], us = {}; d[1].forEach(function (u) { us[u.id] = u.nombre; });
      var modulos = lista.map(function (a) { return a.modulo; }).filter(function (m, i, x) { return x.indexOf(m) === i; }).sort();
      $('#au').innerHTML = '<div class="filtros"><select id="auMod" aria-label="Módulo"><option value="">Todos los módulos</option>' + modulos.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>' +
        '<select id="auTipo" aria-label="Tipo"><option value="">Todo</option><option value="con_clave">Con clave</option><option value="alerta">Alertas</option><option value="sunat">SUNAT</option></select></div><div id="auLista"></div>';
      function pintar() {
        var m = $('#auMod').value, t = $('#auTipo').value;
        var vis = lista.filter(function (a) { return (!m || a.modulo === m) && (!t || a.tipo === t || (t === 'con_clave' && a.con_clave)); });
        $('#auLista').innerHTML = vis.length ? '<div class="card"><ul class="audit">' + vis.map(function (a) {
          return '<li class="' + (a.tipo === 'alerta' ? 'alerta' : '') + '"><div class="au-cab"><b>' + esc(a.modulo) + ' · ' + esc(a.accion) + (a.registro_id ? ' #' + esc(a.registro_id) : '') + '</b>' +
            (a.con_clave ? '<span class="pill r-admin">Con clave</span>' : '') + (a.tipo === 'alerta' ? '<span class="pill r-anul">Alerta</span>' : '') + (a.tipo === 'sunat' ? '<span class="pill e-off">SUNAT</span>' : '') +
            '<small>' + HS.fecha(a.creado_en) + ' · ' + esc(us[a.usuario_id] || (a.usuario_id ? 'Usuario' : 'Sistema')) + '</small></div>' +
            '<p>' + esc(a.detalle || resumen(a)) + '</p></li>';
        }).join('') + '</ul></div>' : R.vacio('No hay registros con ese filtro.');
      }
      $('#auMod').addEventListener('change', pintar); $('#auTipo').addEventListener('change', pintar); pintar();
    }).catch(function (e) { $('#au').innerHTML = R.vacio(esc(e.mensaje)); });
  }
  var OCULTOS = ['id', 'creado_en', 'actualizado_en', 'creado_por', 'hash'];
  function corto(v) { var s = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
  function resumen(a) {
    var d = a.despues || {}, b = a.antes || {};
    var claves = Object.keys(a.accion === 'eliminó' ? b : d).filter(function (k) { return OCULTOS.indexOf(k) < 0; }).slice(0, 6);
    return claves.map(function (k) { return a.accion === 'modificó' ? k + ': ' + corto(b[k]) + ' → ' + corto(d[k]) : k + ': ' + corto((a.accion === 'eliminó' ? b : d)[k]); }).join(' · ');
  }

  /* =================== Reportes =================== */
  var PER = [['hoy', 'Hoy'], ['7', '7 días'], ['mes', 'Este mes'], ['mesant', 'Mes anterior'], ['rango', 'Fechas']];
  var rep = { p: 'mes', desde: null, hasta: null };
  function rango() {
    var hoy = HS.hoyLima(), y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    if (rep.p === 'hoy') return [hoy, hoy];
    if (rep.p === '7') return [R.sumarDias(hoy, -6), hoy];
    if (rep.p === 'mes') return [y + '-' + pad(m) + '-01', hoy];
    if (rep.p === 'mesant') { var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [py + '-' + pad(pm) + '-01', R.sumarDias(y + '-' + pad(m) + '-01', -1)]; }
    return [rep.desde || hoy, rep.hasta || hoy];
  }
  function renderReportes() {
    var r = rango();
    $('#contenido').innerHTML = R.cabeza('Reportes', 'Del ' + R.fCorta(r[0]) + ' al ' + R.fCorta(r[1]) + '. Cada uno se descarga para Excel.', '<button class="btn" type="button" id="repTodo">Descargar todos</button>') +
      '<div class="filtros"><div class="segm" role="group" aria-label="Período">' + PER.map(function (p) { return '<button type="button" data-p="' + p[0] + '" aria-pressed="' + (p[0] === rep.p) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      (rep.p === 'rango' ? '<input type="date" id="repD" value="' + r[0] + '" aria-label="Desde"><input type="date" id="repH" value="' + r[1] + '" aria-label="Hasta"><button class="btn" type="button" id="repVer">Ver</button>' : '') + '</div>' +
      '<div id="rp">' + R.vacio('Calculando…') + '</div>';
    $('#contenido').querySelectorAll('.segm button').forEach(function (b) { b.addEventListener('click', function () { rep.p = b.dataset.p; renderReportes(); }); });
    if (rep.p === 'rango') $('#repVer').addEventListener('click', function () { rep.desde = $('#repD').value; rep.hasta = $('#repH').value; renderReportes(); });
    var desde = r[0], hasta = r[1], hastaSig = R.sumarDias(hasta, 1);
    Promise.all([
      q(sb.from('reservas').select('*').lte('entrada', hasta).gt('salida', desde).not('estado', 'in', '(anulada,no_show)')),
      q(sb.from('pagos').select('*').gte('creado_en', desde + 'T00:00:00-05:00').lt('creado_en', hastaSig + 'T00:00:00-05:00').eq('anulado', false)),
      q(sb.from('comprobantes').select('*').gte('emitido_en', desde + 'T00:00:00-05:00').lt('emitido_en', hastaSig + 'T00:00:00-05:00')),
      HS.cargarHotel()
    ]).then(function (d) {
      var res = d[0], pagos = d[1], comps = d[2], H = d[3];
      var venta = H.habs.filter(function (h) { return !h.fuera_de_venta; }).length || 1;
      return R.clientesDe(res.map(function (x) { return x.cliente_id; })).then(function (cli) {
        var T = [];
        // 1. Ocupación por día
        var filas = [], dia = desde;
        while (dia <= hasta && filas.length < 400) {
          var occ = res.filter(function (x) { return x.entrada <= dia && dia < x.salida; }).length;
          filas.push([R.fCorta(dia), occ, venta, Math.round(occ * 100 / venta) + '%']);
          dia = R.sumarDias(dia, 1);
        }
        var prom = filas.length ? Math.round(filas.reduce(function (s, f) { return s + f[1]; }, 0) * 100 / (venta * filas.length)) : 0;
        T.push({ t: 'Ocupación por día', c: ['Día', 'Ocupadas', 'A la venta', '%'], f: filas, tot: ['Promedio', '', '', prom + '%'] });
        // 2. Ventas por forma de pago
        var pf = {}; pagos.forEach(function (p) { pf[p.forma_pago] = pf[p.forma_pago] || [0, 0]; pf[p.forma_pago][0]++; pf[p.forma_pago][1] += Number(p.monto); });
        var totP = pagos.reduce(function (s, p) { return s + Number(p.monto); }, 0);
        T.push({ t: 'Cobros por forma de pago', c: ['Forma de pago', 'Cobros', 'Monto'], f: Object.keys(pf).map(function (k) { return [k, pf[k][0], soles(pf[k][1])]; }), tot: ['Total', pagos.length, soles(totP)] });
        // 3. Comprobantes emitidos
        T.push({ t: 'Comprobantes emitidos', c: ['Número', 'Fecha', 'Cliente', 'Documento', 'Total', 'Estado'], f: comps.map(function (x) {
          return [x.numero_completo || x.serie, HS.fecha(x.emitido_en), x.cliente_nombre || 'Clientes varios', x.cliente_num_doc || '', soles(x.total), (HS.EST_COMP[x.estado] || [x.estado])[0]];
        }), tot: ['Total válidos', '', '', '', soles(comps.filter(function (x) { return ['aceptado', 'observado', 'interno'].indexOf(x.estado) >= 0 && x.tipo !== 'nota_credito'; }).reduce(function (s, x) { return s + Number(x.total); }, 0)), ''] });
        // 4. Reservas por origen (llegadas en el período)
        var llegan = res.filter(function (x) { return x.entrada >= desde && x.entrada <= hasta; });
        var po = {}; llegan.forEach(function (x) { var k = x.origen || 'Sin origen'; po[k] = po[k] || [0, 0]; po[k][0]++; po[k][1] += R.noches(x); });
        T.push({ t: 'Reservas por origen', c: ['Origen', 'Reservas', 'Noches'], f: Object.keys(po).map(function (k) { return [k, po[k][0], po[k][1]]; }), tot: ['Total', llegan.length, llegan.reduce(function (s, x) { return s + R.noches(x); }, 0)] });
        // 5. Huéspedes por nacionalidad (para MINCETUR)
        var pn = {}; llegan.forEach(function (x) { var k = (cli[x.cliente_id] || {}).nacionalidad || 'Sin dato'; pn[k] = pn[k] || [0, 0]; pn[k][0] += x.personas; pn[k][1] += x.personas * R.noches(x); });
        T.push({ t: 'Huéspedes por nacionalidad (MINCETUR)', c: ['Nacionalidad', 'Llegadas (personas)', 'Pernoctaciones'], f: Object.keys(pn).sort().map(function (k) { return [k, pn[k][0], pn[k][1]]; }),
          tot: ['Total', llegan.reduce(function (s, x) { return s + x.personas; }, 0), llegan.reduce(function (s, x) { return s + x.personas * R.noches(x); }, 0)] });

        $('#rp').innerHTML = T.map(function (t, i) {
          return '<section class="card aj-sec rep"><div class="op-cab"><h2>' + t.t + '</h2><button class="btn btn-sm" type="button" data-i="' + i + '">Descargar Excel</button></div>' +
            (t.f.length ? '<div class="rep-scroll"><table class="tabla"><thead><tr>' + t.c.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
              t.f.map(function (f) { return '<tr>' + f.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
              '<tr class="total">' + t.tot.map(function (v) { return '<td><b>' + esc(v) + '</b></td>'; }).join('') + '</tr></tbody></table></div>' : '<p class="ayuda">Sin datos en este período.</p>') + '</section>';
        }).join('');
        var nombre = 'Hotel Selva Inn - %s - ' + desde + ' al ' + hasta + '.csv';
        $('#rp').querySelectorAll('[data-i]').forEach(function (b) { b.addEventListener('click', function () { var t = T[Number(b.dataset.i)]; bajar(nombre.replace('%s', t.t), csv([t])); }); });
        $('#repTodo').addEventListener('click', function () { bajar(nombre.replace('%s', 'Reportes'), csv(T)); });
      });
    }).catch(function (e) { $('#rp').innerHTML = R.vacio(esc(e.mensaje)); });
  }
  // CSV con ; (Excel en español) y BOM para que se vean las tildes
  function csv(tablas) {
    function celda(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    return '﻿' + tablas.map(function (t) {
      return [[t.t]].concat([t.c], t.f, [t.tot]).map(function (f) { return f.map(celda).join(';'); }).join('\r\n');
    }).join('\r\n\r\n');
  }
  function bajar(nombre, texto) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* =================== Ajustes: tablas simples =================== */
  // cfg: { tabla, llave, ayuda, orden, campos: [{k, l, tipo, req, opciones, ayuda}], columnas: [[titulo, fn]], nuevo }
  function crud(cfg) {
    return function pestana() {
      var c = sb.from(cfg.tabla).select('*');
      (cfg.orden || []).forEach(function (o) { c = c.order(o); });
      q(c).then(function (lista) {
        $('#ajPanel').innerHTML = '<div class="aj-barra"><p class="ayuda">' + cfg.ayuda + '</p><button class="btn btn-pri" type="button" id="crNuevo">+ Agregar</button></div>' +
          '<div class="card">' + (lista.length ? '<table class="tabla"><thead><tr>' + cfg.columnas.map(function (x) { return '<th>' + x[0] + '</th>'; }).join('') + '<th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
            lista.map(function (f, i) {
              return '<tr data-i="' + i + '">' + cfg.columnas.map(function (x, j) { return j === 0 ? '<td><b>' + esc(x[1](f)) + '</b></td>' : '<td class="c-dato" data-l="' + x[0] + '">' + esc(x[1](f)) + '</td>'; }).join('') +
                '<td><div class="acciones"><button class="btn btn-sm" type="button" data-a="e">Editar</button><button class="btn btn-sm" type="button" data-a="b">Eliminar</button></div></td></tr>';
            }).join('') + '</tbody></table>' : '<p class="vacio">Todavía no hay datos.</p>') + '</div>';
        $('#crNuevo').addEventListener('click', function () { modal(null); });
        $('#ajPanel').querySelectorAll('[data-a]').forEach(function (b) {
          var f = lista[Number(b.closest('tr').dataset.i)];
          b.addEventListener('click', function () {
            if (b.dataset.a === 'e') { modal(f); return; }
            HS.confirmar('Eliminar', '¿Seguro? Queda en la auditoría.', 'Eliminar', function () {
              return HS.qFilas(sb.from(cfg.tabla).delete().eq(cfg.llave, f[cfg.llave]).select(), { enUso: 'Está en uso: en vez de eliminarlo, desactívalo.' })
                .then(function () { HS.aviso('Eliminado.'); pestana(); });
            });
          });
        });
      }).catch(function (e) { $('#ajPanel').innerHTML = R.vacio(esc(e.mensaje)); });

      function modal(f) {
        var v = f || cfg.nuevo || {};
        HS.abrirModal({
          titulo: f ? 'Editar' : 'Agregar', ok: 'Guardar',
          cuerpo: cfg.campos.map(function (k) {
            var val = v[k.k] == null ? '' : v[k.k];
            if (k.tipo === 'check') return '<label class="check"><input id="cr_' + k.k + '" type="checkbox"' + (val ? ' checked' : '') + '> ' + k.l + '</label>';
            if (k.tipo === 'select') return '<label>' + k.l + '<select id="cr_' + k.k + '">' + k.opciones.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
            return '<label>' + k.l + '<input id="cr_' + k.k + '" type="' + (k.tipo === 'date' ? 'date' : 'text') + '"' + (k.tipo === 'number' ? ' inputmode="decimal"' : '') + ' value="' + esc(val) + '">' + (k.ayuda ? '<span class="ayuda">' + k.ayuda + '</span>' : '') + '</label>';
          }).join(''),
          guardar: function () {
            var d = {};
            for (var i = 0; i < cfg.campos.length; i++) {
              var k = cfg.campos[i], el = $('#cr_' + k.k);
              if (k.tipo === 'check') { d[k.k] = el.checked; continue; }
              var x = el.value.trim();
              if (k.req && x === '') return Promise.reject({ mensaje: 'Completa: ' + k.l + '.' });
              if (k.tipo === 'number') { if (x === '') { d[k.k] = null; continue; } x = Number(x.replace(',', '.')); if (isNaN(x)) return Promise.reject({ mensaje: k.l + ' debe ser un número.' }); }
              d[k.k] = x === '' ? null : x;
            }
            if (cfg.validar) { var m = cfg.validar(d); if (m) return Promise.reject({ mensaje: m }); }
            var ctx = { repetido: 'Ya existe uno con ese nombre.', invalido: 'Algún dato no es válido.' };
            return (f ? HS.qFilas(sb.from(cfg.tabla).update(d).eq(cfg.llave, f[cfg.llave]).select(), ctx) : q(sb.from(cfg.tabla).insert(d).select(), ctx))
              .then(function () { HS.aviso('Guardado.'); HS.renovarClave(); pestana(); });
          }
        });
      }
    };
  }
  function siNo(b) { return b ? 'Sí' : 'No'; }

  HS.pestanaAjustes('personal', 'Personal', crud({
    tabla: 'personal', llave: 'id', orden: ['nombre'], ayuda: 'Camareras, mozos y demás. No entran al sistema: se usan para asignar tareas.',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'cargo', l: 'Cargo', req: true, ayuda: 'Ej.: Housekeeping, Recepcionista, Mozo' }, { k: 'turno', l: 'Turno' }, { k: 'activo', l: 'Activo', tipo: 'check' }],
    columnas: [['Nombre', function (f) { return f.nombre; }], ['Cargo', function (f) { return f.cargo; }], ['Turno', function (f) { return f.turno || '—'; }], ['Activo', function (f) { return siNo(f.activo); }]],
    nuevo: { activo: true }
  }));
  HS.pestanaAjustes('productos', 'Productos', crud({
    tabla: 'productos', llave: 'id', orden: ['categoria', 'nombre'], ayuda: 'Lo que se carga a la habitación: desayunos, bebidas, lavandería…',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'categoria', l: 'Categoría', req: true, ayuda: 'Ej.: Bebidas, Desayuno, Servicios' },
      { k: 'tipo', l: 'Tipo', tipo: 'select', opciones: ['Servicio', 'Producto', 'Kit'] }, { k: 'precio', l: 'Precio (S/)', tipo: 'number', req: true },
      { k: 'unidad', l: 'Unidad SUNAT', tipo: 'select', opciones: ['ZZ', 'NIU'], ayuda: 'ZZ para servicios, NIU para productos.' },
      { k: 'stock_minimo', l: 'Stock mínimo (solo productos)', tipo: 'number', ayuda: 'Avisa en Almacén cuando quedan menos.' },
      { k: 'en_restaurante', l: 'Se vende en el restaurante', tipo: 'check' }, { k: 'destino', l: 'Comanda va a', tipo: 'select', opciones: ['', 'Cocina', 'Barra'] },
      { k: 'activo', l: 'Se vende', tipo: 'check' }],
    columnas: [['Producto', function (f) { return f.nombre; }], ['Categoría', function (f) { return f.categoria; }], ['Precio', function (f) { return soles(f.precio); }], ['Se vende', function (f) { return siNo(f.activo); }]],
    nuevo: { tipo: 'Servicio', unidad: 'ZZ', activo: true },
    validar: function (d) { return d.precio >= 0 ? '' : 'El precio no puede ser negativo.'; }
  }));
  HS.pestanaAjustes('temporadas', 'Temporadas', crud({
    tabla: 'temporadas', llave: 'id', orden: ['desde'], ayuda: 'Suben (+) o bajan (−) la tarifa en esas fechas. Ej.: Fiestas Patrias +20.',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'desde', l: 'Desde', tipo: 'date', req: true }, { k: 'hasta', l: 'Hasta', tipo: 'date', req: true }, { k: 'porcentaje', l: 'Porcentaje (+ sube, − baja)', tipo: 'number', req: true }],
    columnas: [['Temporada', function (f) { return f.nombre; }], ['Fechas', function (f) { return R.fCorta(f.desde) + ' → ' + R.fCorta(f.hasta); }], ['Cambio', function (f) { return (f.porcentaje > 0 ? '+' : '') + f.porcentaje + '%'; }]],
    validar: function (d) { return d.hasta < d.desde ? '"Hasta" debe ser después de "Desde".' : ''; }
  }));
  HS.pestanaAjustes('pagos', 'Formas de pago', crud({
    tabla: 'formas_pago', llave: 'nombre', orden: ['orden'], ayuda: 'Las que aparecen al cobrar. Desactiva las que no uses.',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'orden', l: 'Orden', tipo: 'number' }, { k: 'activa', l: 'Activa', tipo: 'check' }],
    columnas: [['Forma de pago', function (f) { return f.nombre; }], ['Activa', function (f) { return siNo(f.activa); }]], nuevo: { activa: true }
  }));
  HS.pestanaAjustes('origenes', 'Orígenes', crud({
    tabla: 'origenes', llave: 'nombre', orden: ['orden'], ayuda: 'De dónde llegan las reservas y la comisión que cobra cada uno.',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'comision_pct', l: 'Comisión (%)', tipo: 'number' }, { k: 'orden', l: 'Orden', tipo: 'number' }, { k: 'activo', l: 'Activo', tipo: 'check' }],
    columnas: [['Origen', function (f) { return f.nombre; }], ['Comisión', function (f) { return (f.comision_pct || 0) + '%'; }], ['Activo', function (f) { return siNo(f.activo); }]], nuevo: { activo: true, comision_pct: 0 }
  }));
  HS.pestanaAjustes('motivos', 'Motivos de caja', crud({
    tabla: 'motivos_caja', llave: 'id', orden: ['tipo', 'nombre'], ayuda: 'Motivos frecuentes para ingresos y salidas de caja.',
    campos: [{ k: 'nombre', l: 'Motivo', req: true }, { k: 'tipo', l: 'Tipo', tipo: 'select', opciones: ['ingreso', 'salida'] }, { k: 'activo', l: 'Activo', tipo: 'check' }],
    columnas: [['Motivo', function (f) { return f.nombre; }], ['Tipo', function (f) { return f.tipo; }]], nuevo: { tipo: 'salida', activo: true }
  }));

  HS.vista('limpieza', { l: 'Limpieza', roles: TODOS, render: renderLimpieza, orden: 40 });
  HS.vista('reportes', { l: 'Reportes', roles: TODOS, render: renderReportes, orden: 50 });
  HS.vista('auditoria', { l: 'Auditoría', roles: TODOS, render: renderAuditoria, orden: 60 });
  ['limpieza', 'reportes', 'auditoria'].forEach(HS.conectar);
})();
