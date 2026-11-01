/* Hotel Selva Inn · Puente entre el diseño del prototipo y la base real (Supabase).
   1) Exige sesión (si no hay, va a /ingreso.html).
   2) Carga los datos reales y los deja en window.DATOS_HOTEL.
   3) Recién entonces carga sistema.js (el prototipo), que usa esos datos en vez de los de ejemplo. */
(function () {
  'use strict';
  var C = window.CONFIG_HOTEL, sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  function hoyLima() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()); }
  function horaLima() { var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':'); return Number(p[0]) + Number(p[1]) / 60; }
  function q(c) { return c.then(function (r) { if (r.error) throw r.error; return r.data || []; }); }
  function fallo(msg) {
    document.body.innerHTML = '<main class="carga"><img src="logo.svg" alt="" width="72" height="72"><h1>Hotel Selva Inn</h1><p>' + msg + '</p><a href="/ingreso.html">Volver a entrar</a></main>';
  }

  window.PUENTE = {
    sb: sb,
    // Clave de administrador verificada en el servidor (nunca en el navegador)
    clave: function (v) { return sb.rpc('verificar_clave', { p_clave: v }).then(function (r) { if (r.error) throw r.error; return r.data; }); },
    salir: function () { sb.auth.signOut().then(function () { location.href = '/ingreso.html'; }); }
  };

  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { location.replace('/ingreso.html'); return; }
    return q(sb.from('usuarios').select('nombre, rol, activo').eq('id', s.user.id)).then(function (u) {
      u = u[0];
      if (!u || !u.activo) { sb.auth.signOut(); location.replace('/ingreso.html?sin_acceso=1'); return; }
      PUENTE.nombre = u.nombre; PUENTE.rol = u.rol;
      var hoy = hoyLima();
      return Promise.all([
        q(sb.from('config').select('*').eq('id', 1)),
        q(sb.from('tipos_habitacion').select('*').order('orden')),
        q(sb.from('habitaciones').select('*')),
        q(sb.from('reservas').select('*').gte('salida', addDias(hoy, -62)).order('entrada')),
        q(sb.from('productos').select('*').order('nombre')),
        q(sb.from('personal').select('*').order('nombre')),
        q(sb.from('temporadas').select('*').order('desde')),
        q(sb.from('origenes').select('*').order('orden')),
        q(sb.from('formas_pago').select('*').eq('activa', true).order('orden')),
        q(sb.from('motivos_viaje').select('*').order('orden')),
        q(sb.from('mesas').select('*').eq('activa', true).order('orden')),
        q(sb.from('limpieza').select('*').neq('estado', 'lista')),
        q(sb.from('caja_turnos').select('*').is('cerrado_en', null)),
        q(sb.from('pedidos').select('*').in('estado', ['abierta', 'precuenta'])),
        q(sb.from('pagos').select('*').not('pedido_id', 'is', null).gte('creado_en', addDias(hoy, -62) + 'T00:00:00-05:00')),
        q(sb.from('comprobantes').select('*').eq('tipo', 'nota_credito').gte('emitido_en', addDias(hoy, -62) + 'T00:00:00-05:00')),
        q(sb.from('caja_turnos').select('*').not('cerrado_en', 'is', null).order('abierto_en', { ascending: false }).limit(8)),
        q(sb.from('cierres').select('*').order('fecha', { ascending: false }).limit(10)),
        q(sb.from('clientes').select('*').order('actualizado_en', { ascending: false }).limit(500))
      ]).then(function (d) {
        var res = d[3], ids = res.map(function (x) { return x.id; });
        var cliIds = res.map(function (x) { return x.cliente_id; }).concat(res.map(function (x) { return x.empresa_id; })).filter(function (x, i, a) { return x != null && a.indexOf(x) === i; });
        var pedIds = d[13].map(function (p) { return p.id; }).concat(d[14].map(function (p) { return p.pedido_id; })).filter(function (x, i, a) { return a.indexOf(x) === i; });
        var turnoIds = d[16].map(function (t) { return t.id; }).concat(d[12].map(function (t) { return t.id; }));
        return Promise.all([
          ids.length ? q(sb.from('consumos').select('*').in('reserva_id', ids).eq('anulado', false)) : [],
          ids.length ? q(sb.from('pagos').select('*').in('reserva_id', ids)) : [],
          cliIds.length ? q(sb.from('clientes').select('*').in('id', cliIds)) : [],
          q(sb.from('clientes').select('*').eq('no_grato', true)),
          pedIds.length ? q(sb.from('pedido_items').select('*').in('pedido_id', pedIds).order('id')) : [],
          pedIds.length ? q(sb.from('pedidos').select('*').in('id', pedIds)) : [],
          turnoIds.length ? q(sb.from('caja_movimientos').select('*').in('turno_id', turnoIds).order('creado_en')) : [],
          turnoIds.length ? q(sb.from('pagos').select('*').in('turno_id', turnoIds).eq('forma_pago', 'Efectivo').order('creado_en')) : []
        ]).then(function (x) {
          var compIds = x[1].concat(d[14]).map(function (p) { return p.comprobante_id; }).concat(d[15].map(function (c) { return c.afectado_id; })).filter(Boolean);
          return (compIds.length ? q(sb.from('comprobantes').select('*').in('id', compIds)) : Promise.resolve([])).then(function (comps) {
            window.DATOS_HOTEL = {
              hoy: hoy, hora: horaLima(), config: d[0][0] || {}, tipos: d[1], habitaciones: d[2], reservas: res, productos: d[4], personal: d[5],
              temporadas: d[6], origenes: d[7], formas: d[8], motivos: d[9], mesas: d[10], limpieza: d[11], caja: d[12][0] || null,
              consumos: x[0], pagos: x[1], clientes: x[2], noGratos: x[3], comprobantes: comps.concat(d[15]), usuario: u,
              pedidosAbiertos: d[13], pagosRest: d[14], notasCredito: d[15], turnos: d[16], cierres: d[17], clientesTodos: d[18],
              pedidoItems: x[4], pedidos: x[5], cajaMov: x[6], pagosEfectivo: x[7]
            };
            var s2 = document.createElement('script'); s2.src = 'sistema.js'; document.body.appendChild(s2);
          });
        });
      });
    });
  }).catch(function (e) {
    fallo(/fetch|network/i.test(String(e && e.message)) ? 'Sin conexión a internet. Revisa la conexión y recarga.' : 'No se pudieron cargar los datos del hotel.');
  });
  function addDias(iso, n) { var t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
})();
