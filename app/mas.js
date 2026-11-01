/* Hotel Selva Inn · Restaurante, Almacén, Cierre del día, Timeline y Resumen del día */
(function () {
  'use strict';
  var HS = window.HS, sb = HS.sb, $ = HS.$, esc = HS.esc, q = HS.q, soles = HS.soles, R = HS.reservas;
  var TODOS = ['admin', 'recepcion', 'dueno'], OPERAN = ['admin', 'recepcion'];
  function op() { return HS.yo().rol !== 'dueno'; }
  function suma(l, f) { return Math.round(l.reduce(function (s, x) { return s + Number(f(x)); }, 0) * 100) / 100; }

  // Descuenta del almacén los productos con stock (si no alcanza, solo avisa)
  function descontarStock(items, ref) {
    var conStock = items.filter(function (i) { return i.producto && i.producto.tipo === 'Producto'; });
    return Promise.all(conStock.map(function (i) {
      return sb.from('movimientos_stock').insert({ producto_id: i.producto.id, tipo: 'salida', cantidad: i.cantidad, referencia: ref }).then(function (r) { return r.error ? i.producto.nombre : null; });
    })).then(function (faltan) { faltan = faltan.filter(Boolean); if (faltan.length) HS.aviso('Ojo: no había stock suficiente de ' + faltan.join(', ') + '. Revisa el Almacén.'); });
  }

  /* =================== Resumen del día (Inicio) =================== */
  HS.resumenDia = function (caja) {
    var hoy = HS.hoyLima();
    Promise.all([
      q(sb.from('reservas').select('*').lte('entrada', hoy).gte('salida', hoy).in('estado', R.ACTIVAS)),
      q(sb.from('pagos').select('monto').gte('creado_en', hoy + 'T00:00:00-05:00').eq('anulado', false)),
      q(sb.from('habitaciones').select('numero').eq('fuera_de_venta', false))
    ]).then(function (d) {
      var res = d[0], enCasa = res.filter(function (r) { return r.estado === 'ocupado'; });
      var llegan = res.filter(function (r) { return r.entrada === hoy && r.estado !== 'ocupado'; }).length;
      var salen = enCasa.filter(function (r) { return r.salida === hoy; }).length;
      var noche = res.filter(function (r) { return r.salida > hoy; }).length;
      var ids = enCasa.map(function (r) { return r.id; });
      return Promise.all([ids.length ? q(sb.from('pagos').select('reserva_id, monto, anulado').in('reserva_id', ids)) : [], ids.length ? q(sb.from('consumos').select('reserva_id, cantidad, precio, anulado').in('reserva_id', ids)) : []]).then(function (x) {
        var porCobrar = enCasa.reduce(function (s, r) {
          var k = HS.cuentaDe({ r: r, pagos: x[0].filter(function (p) { return p.reserva_id === r.id; }), consumos: x[1].filter(function (c) { return c.reserva_id === r.id; }) });
          return s + Math.max(0, k.saldo);
        }, 0);
        var pct = d[2].length ? Math.round(noche * 100 / d[2].length) : 0;
        if (!document.body.contains(caja)) return;
        caja.innerHTML = '<div class="kpis">' +
          '<div class="card kpi h-occ"><b>' + pct + '%</b><span>Ocupación esta noche</span></div>' +
          '<div class="card kpi h-res"><b>' + llegan + '</b><span>Llegan hoy</span></div>' +
          '<div class="card kpi h-sale"><b>' + salen + '</b><span>Salen hoy</span></div>' +
          '<div class="card kpi h-libre"><b>' + soles(suma(d[1], function (p) { return p.monto; })) + '</b><span>Cobrado hoy</span></div>' +
          '<div class="card kpi h-limpia"><b>' + soles(porCobrar) + '</b><span>Por cobrar en casa</span></div></div>';
      });
    }).catch(function (e) { caja.innerHTML = '<p class="vacio">' + esc(e.mensaje) + '</p>'; });
  };

  /* =================== Restaurante =================== */
  var ambiente = null;
  function renderRestaurante() {
    $('#contenido').innerHTML = R.cabeza('Restaurante', 'Toca una mesa para tomar el pedido, mandar la comanda o cobrar.') + '<div id="rs">' + R.vacio('Cargando…') + '</div>';
    Promise.all([q(sb.from('mesas').select('*').eq('activa', true).order('orden')), q(sb.from('pedidos').select('*').in('estado', ['abierta', 'precuenta']))]).then(function (d) {
      var mesas = d[0], abiertos = {};
      d[1].forEach(function (p) { if (p.mesa_id) abiertos[p.mesa_id] = p; });
      var ambientes = mesas.map(function (m) { return m.ambiente; }).filter(function (a, i, x) { return x.indexOf(a) === i; });
      if (!ambiente || ambientes.indexOf(ambiente) < 0) ambiente = ambientes[0];
      var pids = d[1].map(function (p) { return p.id; });
      return (pids.length ? q(sb.from('pedido_items').select('*').in('pedido_id', pids)) : Promise.resolve([])).then(function (items) {
        function tot(p) { return suma(items.filter(function (i) { return i.pedido_id === p.id; }), function (i) { return i.cantidad * i.precio; }); }
        $('#rs').innerHTML = '<div class="filtros"><div class="segm" role="group" aria-label="Ambiente">' + ambientes.map(function (a) {
          var n = mesas.filter(function (m) { return m.ambiente === a && abiertos[m.id]; }).length;
          return '<button type="button" data-a="' + esc(a) + '" aria-pressed="' + (a === ambiente) + '">' + esc(a) + (n ? ' · ' + n : '') + '</button>';
        }).join('') + '</div><span class="chip">' + d[1].length + ' mesas con pedido</span></div>' +
          '<div class="habs mesas">' + mesas.filter(function (m) { return m.ambiente === ambiente; }).map(function (m) {
            var p = abiertos[m.id], cls = !p ? 'h-libre' : p.estado === 'precuenta' ? 'h-limpia' : 'h-occ';
            return '<button type="button" class="hab ' + cls + '" data-m="' + esc(m.id) + '"><b>Mesa ' + esc(m.nombre) + '</b><span>' + m.asientos + ' asientos</span>' +
              '<i>' + (!p ? 'Libre' : (p.estado === 'precuenta' ? 'Precuenta · ' : 'Con pedido · ') + soles(tot(p))) + '</i></button>';
          }).join('') + '</div>';
        $('#rs').querySelectorAll('.segm button').forEach(function (b) { b.addEventListener('click', function () { ambiente = b.dataset.a; renderRestaurante(); }); });
        $('#rs').querySelectorAll('.mesas .hab').forEach(function (b) { b.addEventListener('click', function () { HS.ir('#mesa/' + encodeURIComponent(b.dataset.m)); }); });
      });
    }).catch(function (e) { $('#rs').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  function renderMesa(idTxt) {
    var mesaId = decodeURIComponent(idTxt || '');
    $('#contenido').innerHTML = '<a class="volver" href="#restaurante">← Restaurante</a><div id="ms">' + R.vacio('Cargando…') + '</div>';
    Promise.all([
      q(sb.from('mesas').select('*').eq('id', mesaId).maybeSingle()),
      q(sb.from('pedidos').select('*').eq('mesa_id', mesaId).in('estado', ['abierta', 'precuenta']).limit(1)),
      q(sb.from('productos').select('*').eq('activo', true).eq('en_restaurante', true).order('categoria').order('nombre'))
    ]).then(function (d) {
      var mesa = d[0], pedido = d[1][0], prods = d[2];
      if (!mesa) { $('#ms').innerHTML = R.vacio('Mesa no encontrada.'); return; }
      return (pedido ? q(sb.from('pedido_items').select('*').eq('pedido_id', pedido.id).order('creado_en')) : Promise.resolve([])).then(function (items) {
        pintarMesa(mesa, pedido, items, prods);
      });
    }).catch(function (e) { $('#ms').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  var catSel = null;
  function pintarMesa(mesa, pedido, items, prods) {
    var total = suma(items, function (i) { return i.cantidad * i.precio; });
    var pend = items.filter(function (i) { return i.cantidad > i.enviados; });
    var cats = prods.map(function (p) { return p.categoria; }).filter(function (c, i, x) { return x.indexOf(c) === i; });
    if (!catSel || cats.indexOf(catSel) < 0) catSel = cats[0];
    $('#ms').innerHTML = '<div class="cabeza"><div><h1>Mesa ' + esc(mesa.nombre) + '</h1><p class="sub">' + esc(mesa.ambiente) + ' · ' + mesa.asientos + ' asientos' +
      (pedido ? ' · desde ' + HS.fecha(pedido.abierto_en).split(' · ')[1] + (pedido.estado === 'precuenta' ? ' · en precuenta' : '') : ' · libre') + '</p></div></div>' +
      '<div class="det-grid dos">' +
        '<section class="card aj-sec"><h2>Carta</h2>' + (prods.length ? '<div class="segm" role="group" aria-label="Categoría">' + cats.map(function (c) {
          return '<button type="button" data-c="' + esc(c) + '" aria-pressed="' + (c === catSel) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
          '<div class="carta">' + prods.filter(function (p) { return p.categoria === catSel; }).map(function (p) {
            return '<button type="button" class="nr-op" data-p="' + p.id + '"' + (op() ? '' : ' disabled') + '><b>' + esc(p.nombre) + '</b><span>' + soles(p.precio) + (p.destino ? ' · ' + esc(p.destino) : '') + '</span></button>';
          }).join('') + '</div>' : '<p class="ayuda">No hay productos del restaurante. Agrégalos en Ajustes → Productos y marca "Se vende en el restaurante".</p>') + '</section>' +
        '<section class="card aj-sec"><h2>Pedido</h2>' + (items.length ? '<ul class="cuenta">' + items.map(function (i) {
          return '<li><span>' + esc(i.descripcion) + (i.cantidad > i.enviados ? ' <small class="t-dan">' + (i.cantidad - i.enviados) + ' por enviar</small>' : '') + '</span>' +
            (op() && pedido.estado === 'abierta' ? '<span class="cant"><button type="button" class="btn-icon" data-menos="' + i.id + '" aria-label="Menos">−</button><b>' + Number(i.cantidad) + '</b><button type="button" class="btn-icon" data-mas="' + i.id + '" aria-label="Más">+</button></span>' : '<span>× ' + Number(i.cantidad) + '</span>') +
            '<b>' + soles(i.cantidad * i.precio) + '</b></li>';
        }).join('') + '<li class="total"><span>Total</span><b>' + soles(total) + '</b></li></ul>' : '<p class="ayuda">Toca un producto de la carta para empezar el pedido.</p>') +
        (op() && pedido && items.length ? '<div class="acciones">' +
          (pend.length ? '<button class="btn btn-pri" type="button" data-x="comanda">Enviar comanda (' + pend.length + ')</button>' : '') +
          (pedido.estado === 'abierta' ? '<button class="btn" type="button" data-x="precuenta">Precuenta</button>' : '<button class="btn" type="button" data-x="reabrir">Seguir pidiendo</button>') +
          '<button class="btn btn-pri" type="button" data-x="cobrar">Cobrar ' + soles(total) + '</button>' +
          '<button class="btn" type="button" data-x="cargar">Cargar a habitación</button>' +
          '<button class="btn btn-peligro-borde" type="button" data-x="anular">Anular</button></div>' : '') + '</section></div>';

    $('#ms').querySelectorAll('[data-c]').forEach(function (b) { b.addEventListener('click', function () { catSel = b.dataset.c; pintarMesa(mesa, pedido, items, prods); }); });
    function recargar() { renderMesa(encodeURIComponent(mesa.id)); }
    $('#ms').querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = prods.filter(function (x) { return String(x.id) === b.dataset.p; })[0];
        if (pedido && pedido.estado !== 'abierta') { HS.aviso('El pedido está en precuenta: toca "Seguir pidiendo".'); return; }
        var ya = items.filter(function (i) { return i.producto_id === p.id && i.enviados === 0; })[0];
        var paso = pedido ? Promise.resolve(pedido) : q(sb.from('pedidos').insert({ mesa_id: mesa.id }).select(), { repetido: 'Esa mesa ya tiene un pedido abierto.' }).then(function (f) { return f[0]; });
        paso.then(function (ped) {
          return ya ? HS.qFilas(sb.from('pedido_items').update({ cantidad: Number(ya.cantidad) + 1 }).eq('id', ya.id).select())
            : q(sb.from('pedido_items').insert({ pedido_id: ped.id, producto_id: p.id, descripcion: p.nombre, precio: p.precio, cantidad: 1, destino: p.destino }).select());
        }).then(recargar, function (e) { HS.aviso(e.mensaje); });
      });
    });
    $('#ms').querySelectorAll('[data-mas],[data-menos]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = items.filter(function (x) { return String(x.id) === (b.dataset.mas || b.dataset.menos); })[0], n = Number(i.cantidad) + (b.dataset.mas ? 1 : -1);
        if (n < i.enviados) { HS.aviso('Eso ya salió en la comanda: para quitarlo, anula el pedido con clave.'); return; }
        (n <= 0 ? HS.qFilas(sb.from('pedido_items').delete().eq('id', i.id).select()) : HS.qFilas(sb.from('pedido_items').update({ cantidad: n }).eq('id', i.id).select()))
          .then(recargar, function (e) { HS.aviso(e.mensaje); });
      });
    });
    var X = {
      comanda: function () {
        Promise.all(pend.map(function (i) { return HS.qFilas(sb.from('pedido_items').update({ enviados: i.cantidad }).eq('id', i.id).select()); })).then(function () {
          HS.abrirModal({ titulo: 'Comanda · Mesa ' + mesa.nombre, ok: 'Listo', cuerpo: ['Cocina', 'Barra', null].map(function (dest) {
            var de = pend.filter(function (i) { return (i.destino || null) === dest; });
            return de.length ? '<h3>' + (dest || 'Sin destino') + '</h3><ul class="cuenta">' + de.map(function (i) { return '<li><span>' + esc(i.descripcion) + '</span><b>× ' + (i.cantidad - i.enviados) + '</b></li>'; }).join('') + '</ul>' : '';
          }).join('') + '<p class="ayuda">La impresión automática en cocina y barra se conecta con el puente de impresoras (pendiente).</p>', guardar: function () { recargar(); return Promise.resolve(); } });
        }, function (e) { HS.aviso(e.mensaje); });
      },
      precuenta: function () { HS.qFilas(sb.from('pedidos').update({ estado: 'precuenta' }).eq('id', pedido.id).select()).then(function () { HS.aviso('Precuenta lista: ' + soles(total) + '.'); recargar(); }, function (e) { HS.aviso(e.mensaje); }); },
      reabrir: function () { HS.qFilas(sb.from('pedidos').update({ estado: 'abierta' }).eq('id', pedido.id).select()).then(recargar, function (e) { HS.aviso(e.mensaje); }); },
      cobrar: function () {
        q(sb.from('formas_pago').select('*').eq('activa', true).order('orden')).then(function (formas) {
          HS.abrirModal({
            titulo: 'Cobrar · Mesa ' + mesa.nombre, ok: 'Cobrar ' + soles(total),
            cuerpo: '<label>Forma de pago<select id="rFor">' + formas.map(function (f) { return '<option>' + esc(f.nombre) + '</option>'; }).join('') + '</select></label>' +
              '<label>Comprobante<select id="rTipo"><option value="boleta">Boleta</option><option value="factura">Factura</option><option value="nota_venta">Nota de venta (interna)</option></select></label>' +
              '<div class="grid2"><label>Documento (DNI o RUC)<input id="rDoc" type="text" inputmode="numeric" placeholder="Opcional en boleta"></label><label>Nombre o razón social<input id="rNom" type="text"></label></div>',
            guardar: function () {
              var tipo = $('#rTipo').value, doc = $('#rDoc').value.trim(), nom = $('#rNom').value.trim(), forma = $('#rFor').value;
              var cli = { tipo_doc: doc.length === 11 ? '6' : doc.length === 8 ? '1' : '0', num_doc: doc || null, nombre: nom || 'Clientes varios' };
              if (tipo === 'factura' && cli.tipo_doc !== '6') return Promise.reject({ mensaje: 'La factura necesita RUC (11 números) y razón social.' });
              if (tipo === 'boleta' && total > 700 && cli.tipo_doc === '0') return Promise.reject({ mensaje: 'Una boleta de más de S/ 700 necesita DNI.' });
              return q(sb.from('caja_turnos').select('id').is('cerrado_en', null).limit(1)).then(function (t) {
                if (!t.length && /efectivo/i.test(forma)) throw { mensaje: 'La caja está cerrada. Ábrela en Caja antes de cobrar en efectivo.' };
                return q(sb.from('pagos').insert({ pedido_id: pedido.id, turno_id: t.length ? t[0].id : null, forma_pago: forma, monto: total, tipo: 'restaurante' }).select());
              }).then(function (p) {
                return HS.qFilas(sb.from('pedidos').update({ estado: 'cobrada', cerrado_en: new Date().toISOString() }).eq('id', pedido.id).select()).then(function () {
                  return descontarStock(items.map(function (i) { return { producto: prods.filter(function (x) { return x.id === i.producto_id; })[0], cantidad: Number(i.cantidad) }; }), 'Restaurante · Mesa ' + mesa.nombre);
                }).then(function () {
                  return HS.facturar({ accion: 'emitir', pago_id: p[0].id, tipo: tipo, cliente: cli }).then(function (r) {
                    HS.aviso('Cobrado. ' + ((r.comprobante || {}).numero_completo || '') + ' · ' + ((HS.EST_COMP[(r.comprobante || {}).estado] || ['Comprobante'])[0]));
                  }, function (e) { HS.aviso('Cobrado, pero el comprobante no se emitió: ' + e.mensaje); });
                });
              }).then(function () { HS.ir('#restaurante'); });
            }
          });
        });
      },
      cargar: function () {
        q(sb.from('reservas').select('*').eq('estado', 'ocupado').order('habitacion')).then(function (res) {
          return R.clientesDe(res.map(function (r) { return r.cliente_id; })).then(function (cli) {
            if (!res.length) { HS.aviso('No hay huéspedes en casa para cargar.'); return; }
            HS.abrirModal({
              titulo: 'Cargar a habitación', ok: 'Cargar ' + soles(total),
              cuerpo: '<label>Habitación<select id="rHab">' + res.map(function (r) { return '<option value="' + r.id + '">Hab. ' + esc(r.habitacion) + ' · ' + esc((cli[r.cliente_id] || {}).nombre || '') + '</option>'; }).join('') + '</select></label>' +
                '<p class="ayuda">Se suma a la cuenta de la habitación y se cobra en el check-out.</p>',
              guardar: function () {
                var rid = Number($('#rHab').value);
                return q(sb.from('consumos').insert(items.map(function (i) {
                  return { reserva_id: rid, producto_id: i.producto_id, pedido_id: pedido.id, descripcion: i.descripcion + ' (restaurante)', cantidad: i.cantidad, precio: i.precio, unidad: 'NIU' };
                })).select()).then(function () {
                  return HS.qFilas(sb.from('pedidos').update({ estado: 'cargada', reserva_id: rid, cerrado_en: new Date().toISOString() }).eq('id', pedido.id).select());
                }).then(function () {
                  return descontarStock(items.map(function (i) { return { producto: prods.filter(function (x) { return x.id === i.producto_id; })[0], cantidad: Number(i.cantidad) }; }), 'Restaurante · cargo a habitación');
                }).then(function () { HS.aviso('Cargado a la habitación.'); HS.ir('#restaurante'); });
              }
            });
          });
        }, function (e) { HS.aviso(e.mensaje); });
      },
      anular: function () {
        HS.conClave('Anular un pedido', function () {
          HS.confirmar('Anular pedido · Mesa ' + mesa.nombre, 'La mesa queda libre y el pedido anulado en la auditoría.', 'Anular', function () {
            return HS.qFilas(sb.from('pedidos').update({ estado: 'anulada', cerrado_en: new Date().toISOString() }).eq('id', pedido.id).select()).then(function () { HS.aviso('Pedido anulado.'); HS.ir('#restaurante'); });
          });
        });
      }
    };
    $('#ms').querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { X[b.dataset.x](); }); });
  }

  /* =================== Almacén =================== */
  function renderAlmacen() {
    $('#contenido').innerHTML = R.cabeza('Almacén', 'Stock de los productos que se venden. Las ventas y cargos lo descuentan solos.',
      op() ? '<button class="btn" type="button" id="alSal">− Salida</button><button class="btn btn-pri" type="button" id="alEnt">+ Entrada</button>' : '') + '<div id="al">' + R.vacio('Cargando…') + '</div>';
    Promise.all([q(sb.from('productos').select('*').eq('tipo', 'Producto').order('nombre')), q(sb.from('movimientos_stock').select('*').order('creado_en', { ascending: false }).limit(50))]).then(function (d) {
      var prods = d[0], movs = d[1], porId = R.porId(prods), hoy = HS.hoyLima();
      function estado(p) {
        var s = Number(p.stock || 0);
        if (s <= 0) return '<span class="pill r-anul">Sin stock</span>';
        if (p.stock_minimo != null && s < Number(p.stock_minimo)) return '<span class="pill r-res">Bajo</span>';
        return '<span class="pill e-on">Bien</span>';
      }
      $('#al').innerHTML = (prods.length ? '<div class="card"><table class="tabla"><thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Vence</th><th>Estado</th></tr></thead><tbody>' + prods.map(function (p) {
        var vence = p.vence ? R.diasEntre(hoy, p.vence) : null;
        return '<tr><td><b>' + esc(p.nombre) + '</b><small>' + esc(p.categoria) + (p.lote ? ' · Lote ' + esc(p.lote) : '') + '</small></td><td class="c-dato" data-l="Stock">' + Number(p.stock || 0) + '</td>' +
          '<td class="c-dato" data-l="Mínimo">' + (p.stock_minimo != null ? Number(p.stock_minimo) : '—') + '</td>' +
          '<td class="c-dato" data-l="Vence">' + (p.vence ? R.fCorta(p.vence) + (vence <= 15 ? ' <span class="t-dan">(' + (vence < 0 ? 'vencido' : 'en ' + vence + ' días') + ')</span>' : '') : '—') + '</td><td class="c-pill">' + estado(p) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : R.vacio('No hay productos con stock. En Ajustes → Productos, pon el tipo "Producto".')) +
      '<section class="card aj-sec"><h2>Últimos movimientos</h2>' + (movs.length ? '<ul class="cuenta">' + movs.map(function (m) {
        return '<li><span>' + (m.tipo === 'entrada' ? '+ ' : '− ') + esc((porId[m.producto_id] || {}).nombre || 'Producto') + (m.referencia ? ' · ' + esc(m.referencia) : '') + '<small>' + HS.fecha(m.creado_en) + '</small></span><b>' + Number(m.cantidad) + '</b></li>';
      }).join('') + '</ul>' : '<p class="ayuda">Sin movimientos.</p>') + '</section>';
      if (!op()) return;
      $('#alEnt').addEventListener('click', function () { modalMov(prods, 'entrada'); });
      $('#alSal').addEventListener('click', function () { modalMov(prods, 'salida'); });
    }).catch(function (e) { $('#al').innerHTML = R.vacio(esc(e.mensaje)); });
  }
  function modalMov(prods, tipo) {
    if (!prods.length) { HS.aviso('Primero agrega productos de tipo "Producto" en Ajustes → Productos.'); return; }
    HS.abrirModal({
      titulo: tipo === 'entrada' ? 'Entrada al almacén' : 'Salida del almacén', ok: 'Guardar',
      cuerpo: '<label>Producto<select id="amP">' + prods.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + ' · hay ' + Number(p.stock || 0) + '</option>'; }).join('') + '</select></label>' +
        '<label>Cantidad<input id="amC" type="text" inputmode="decimal"></label>' +
        (tipo === 'entrada' ? '<label>Proveedor y guía<input id="amR" type="text" placeholder="Ej.: Guía G-0031 · Distribuidora"></label><div class="grid3"><label>Costo unitario<input id="amCo" type="text" inputmode="decimal"></label><label>Lote<input id="amL" type="text"></label><label>Vence<input id="amV" type="date"></label></div>'
          : '<label>Motivo<input id="amR" type="text" placeholder="Ej.: Merma, vencido, consumo interno"></label>'),
      guardar: function () {
        var c = Number($('#amC').value.replace(',', '.'));
        if (!(c > 0)) return Promise.reject({ mensaje: 'Escribe una cantidad mayor que cero.' });
        if (!$('#amR').value.trim()) return Promise.reject({ mensaje: tipo === 'entrada' ? 'Escribe el proveedor o la guía.' : 'Escribe el motivo.' });
        var d = { producto_id: Number($('#amP').value), tipo: tipo, cantidad: c, referencia: $('#amR').value.trim() };
        if (tipo === 'entrada') { var co = Number(($('#amCo').value || '').replace(',', '.')); if (co > 0) d.costo = co; if ($('#amL').value.trim()) d.lote = $('#amL').value.trim(); if ($('#amV').value) d.vence = $('#amV').value; }
        return q(sb.from('movimientos_stock').insert(d).select()).then(function () { HS.aviso(tipo === 'entrada' ? 'Entrada guardada.' : 'Salida guardada.'); renderAlmacen(); },
          function (e) { throw { mensaje: tipo === 'salida' ? 'No hay stock suficiente para esa salida.' : e.mensaje }; });
      }
    });
  }

  /* =================== Cierre del día =================== */
  function renderCierre() {
    var hoy = HS.hoyLima();
    $('#contenido').innerHTML = R.cabeza('Cierre del día', R.fLarga(hoy) + '. Revisa los pendientes antes de cerrar.') + '<div id="ci">' + R.vacio('Revisando…') + '</div>';
    Promise.all([
      q(sb.from('reservas').select('*').in('estado', ['reservado', 'confirmado']).lte('entrada', hoy)),
      q(sb.from('reservas').select('*').eq('estado', 'ocupado').lte('salida', hoy)),
      q(sb.from('limpieza').select('habitacion').neq('estado', 'lista')),
      q(sb.from('caja_turnos').select('*').is('cerrado_en', null)),
      q(sb.from('pagos').select('monto').gte('creado_en', hoy + 'T00:00:00-05:00').eq('anulado', false)),
      q(sb.from('cierres').select('*').order('fecha', { ascending: false }).limit(10)),
      q(sb.from('reservas').select('*').lte('entrada', hoy).gt('salida', hoy).in('estado', R.ACTIVAS)),
      q(sb.from('habitaciones').select('numero').eq('fuera_de_venta', false)),
      q(sb.from('comprobantes').select('id').in('estado', ['error', 'sin_internet', 'pendiente', 'por_verificar']))
    ]).then(function (d) {
      var hecho = d[5].filter(function (c) { return c.fecha === hoy; })[0];
      var ingresos = suma(d[4], function (p) { return p.monto; }), occ = d[7].length ? Math.round(d[6].length * 100 / d[7].length) : 0;
      var revis = [
        ['Llegadas sin check-in', d[0].length, 'Haz el check-in o márcalas como "No llegó" / anula.', '#reservas'],
        ['Salidas pendientes', d[1].length, 'Huéspedes que debían salir hoy o antes y siguen en casa.', '#reservas'],
        ['Habitaciones por limpiar', d[2].length, 'Quedarán para mañana.', '#limpieza'],
        ['Comprobantes por revisar', d[8].length, 'Con error, sin conexión o esperando a SUNAT.', '#ventas'],
        ['Caja abierta', d[3].length, 'Ciérrala con el arqueo antes de terminar el turno.', '#caja']
      ];
      var pendientes = revis.filter(function (x) { return x[1] > 0; }).length;
      $('#ci').innerHTML = '<div class="kpis"><div class="card kpi h-libre"><b>' + soles(ingresos) + '</b><span>Cobrado hoy</span></div><div class="card kpi h-occ"><b>' + occ + '%</b><span>Ocupación esta noche</span></div>' +
        '<div class="card kpi ' + (pendientes ? 'h-sale' : 'h-libre') + '"><b>' + pendientes + '</b><span>Pendientes</span></div></div>' +
        '<section class="card aj-sec"><h2>Revisión</h2><ul class="cuenta">' + revis.map(function (x) {
          return '<li><span>' + (x[1] ? '⚠ ' : '✓ ') + x[0] + '<small>' + x[2] + '</small></span>' + (x[1] ? '<a class="btn btn-sm" href="' + x[3] + '">' + x[1] + ' · Ver</a>' : '<b class="ok-txt">Al día</b>') + '</li>';
        }).join('') + '</ul>' +
        (hecho ? '<p class="ayuda">El día ya se cerró a las ' + HS.fecha(hecho.cerrado_en).split(' · ')[1] + ' por ' + esc(hecho.responsable) + '.</p>'
          : (op() ? '<div class="aj-pie"><button class="btn btn-pri" type="button" id="ciCerrar">Cerrar el día</button></div>' : '')) + '</section>' +
        '<section class="card aj-sec"><h2>Cierres anteriores</h2>' + (d[5].length ? '<ul class="cuenta">' + d[5].map(function (c) {
          return '<li><span>' + R.fCorta(c.fecha) + ' · ' + esc(c.responsable) + '<small>Ocupación ' + Number(c.ocupacion_pct) + '% · ' + c.llegadas + ' llegadas · ' + c.salidas + ' salidas</small></span><b>' + soles(c.ingresos) + '</b></li>';
        }).join('') + '</ul>' : '<p class="ayuda">Todavía no hay cierres.</p>') + '</section>';
      if ($('#ciCerrar')) $('#ciCerrar').addEventListener('click', function () {
        HS.confirmar('Cerrar el día', pendientes ? '<b class="t-dan">Hay ' + pendientes + ' pendientes.</b> ¿Cerrar igual?' : 'Todo está al día. ¿Cerrar?', 'Cerrar el día', function () {
          return q(sb.from('cierres').insert({ fecha: hoy, responsable: HS.yo().nombre, ingresos: ingresos, ocupacion_pct: occ,
            llegadas: d[6].filter(function (r) { return r.entrada === hoy; }).length, salidas: d[1].length,
            resumen: { pendientes: revis.map(function (x) { return [x[0], x[1]]; }) } }).select(), { repetido: 'El día ya se cerró.' })
            .then(function () { HS.aviso('Día cerrado.'); renderCierre(); });
        });
      });
    }).catch(function (e) { $('#ci').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  /* =================== Timeline =================== */
  var mesTl = null;
  function renderTimeline() {
    var hoy = HS.hoyLima();
    if (!mesTl) mesTl = hoy.slice(0, 7);
    var ini = mesTl + '-01', y = Number(mesTl.slice(0, 4)), m = Number(mesTl.slice(5, 7));
    var dias = new Date(Date.UTC(y, m, 0)).getUTCDate(), fin = R.sumarDias(ini, dias);
    var titulo = new Date(ini + 'T12:00:00Z').toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    $('#contenido').innerHTML = R.cabeza('Timeline', 'Toca un espacio libre para reservar o una reserva para abrirla.',
      '<button class="btn" type="button" id="tlAnt" aria-label="Mes anterior">←</button><button class="btn" type="button" id="tlHoy">Hoy</button><button class="btn" type="button" id="tlSig" aria-label="Mes siguiente">→</button>') +
      '<h2 class="tl-mes">' + titulo.charAt(0).toUpperCase() + titulo.slice(1) + '</h2><div id="tl">' + R.vacio('Cargando…') + '</div>';
    function mover(n) { var d = new Date(Date.UTC(y, m - 1 + n, 1)); mesTl = d.toISOString().slice(0, 7); renderTimeline(); }
    $('#tlAnt').addEventListener('click', function () { mover(-1); });
    $('#tlSig').addEventListener('click', function () { mover(1); });
    $('#tlHoy').addEventListener('click', function () { mesTl = hoy.slice(0, 7); renderTimeline(); });
    Promise.all([HS.cargarHotel(), q(sb.from('reservas').select('*').lt('entrada', fin).gt('salida', ini).not('estado', 'in', '(anulada,no_show)'))]).then(function (d) {
      var H = d[0], res = d[1];
      return R.clientesDe(res.map(function (r) { return r.cliente_id; })).then(function (cli) {
        var cab = '<tr><th class="tl-hab">Hab.</th>';
        for (var i = 0; i < dias; i++) { var di = R.sumarDias(ini, i), dw = new Date(di + 'T12:00:00Z').getUTCDay(); cab += '<th class="' + (di === hoy ? 'tl-hoy' : '') + (dw === 0 || dw === 6 ? ' tl-fin' : '') + '">' + (i + 1) + '</th>'; }
        cab += '</tr>';
        var filas = H.habs.slice().sort(function (a, b) { return a.piso - b.piso || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }); }).map(function (h) {
          var tr = '<tr><th class="tl-hab">' + esc(h.numero) + '<small>' + esc(HS.nombreTipo(H, h.tipo)) + '</small></th>', i = 0;
          var suyas = res.filter(function (r) { return r.habitacion === h.numero; });
          while (i < dias) {
            var dia = R.sumarDias(ini, i), r = suyas.filter(function (x) { return x.entrada <= dia && dia < x.salida; })[0];
            if (r) {
              var hasta = r.salida < fin ? R.diasEntre(ini, r.salida) : dias, span = hasta - i;
              tr += '<td colspan="' + span + '" class="tl-r ' + (r.estado === 'ocupado' ? 'h-occ' : r.estado === 'finalizada' ? 'h-fuera' : 'h-res') + '"><button type="button" data-r="' + r.id + '" title="' + esc(((cli[r.cliente_id] || {}).nombre || 'Reserva') + ' · ' + R.fCorta(r.entrada) + ' → ' + R.fCorta(r.salida)) + '">' + esc((cli[r.cliente_id] || {}).nombre || 'Reserva') + '</button></td>';
              i = hasta;
            } else {
              tr += '<td class="tl-libre' + (h.fuera_de_venta ? ' tl-fuera' : '') + '">' + (op() && !h.fuera_de_venta && dia >= hoy ? '<button type="button" data-h="' + esc(h.numero) + '" data-d="' + dia + '" aria-label="Reservar ' + esc(h.numero) + ' el ' + (i + 1) + '"></button>' : '') + '</td>';
              i++;
            }
          }
          return tr + '</tr>';
        }).join('');
        $('#tl').innerHTML = '<div class="card tl-caja"><table class="tl"><thead>' + cab + '</thead><tbody>' + filas + '</tbody></table></div>' +
          '<div class="leyenda"><span class="chip h-occ">En casa</span><span class="chip h-res">Reservada</span><span class="chip h-fuera">Finalizada</span></div>';
        $('#tl').querySelectorAll('[data-r]').forEach(function (b) { b.addEventListener('click', function () { HS.ir('#reserva/' + b.dataset.r); }); });
        $('#tl').querySelectorAll('[data-h]').forEach(function (b) { b.addEventListener('click', function () { HS.nuevaReserva({ habitacion: b.dataset.h, entrada: b.dataset.d }); }); });
      });
    }).catch(function (e) { $('#tl').innerHTML = R.vacio(esc(e.mensaje)); });
  }

  HS.vista('timeline', { l: 'Timeline', roles: TODOS, render: renderTimeline, orden: 15 });
  HS.vista('restaurante', { l: 'Restaurante', roles: OPERAN, render: renderRestaurante, orden: 38 });
  HS.vista('mesa', { l: 'Mesa', roles: OPERAN, render: renderMesa, menu: false, padre: 'restaurante' });
  HS.vista('almacen', { l: 'Almacén', roles: OPERAN, render: renderAlmacen, orden: 45 });
  HS.vista('cierre', { l: 'Cierre', roles: TODOS, render: renderCierre, orden: 55 });
  HS.vista('productos', { l: 'Productos', roles: OPERAN, render: function () { HS.ir('#ajustes/productos'); }, menu: false, padre: 'ajustes' });
  ['timeline', 'restaurante', 'almacen', 'cierre', 'inicio', 'productos', 'clientes'].forEach(HS.conectar);
})();
