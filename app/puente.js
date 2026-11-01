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
        q(sb.from('caja_turnos').select('*').is('cerrado_en', null))
      ]).then(function (d) {
        var res = d[3], ids = res.map(function (x) { return x.id; });
        var cliIds = res.map(function (x) { return x.cliente_id; }).concat(res.map(function (x) { return x.empresa_id; })).filter(function (x, i, a) { return x != null && a.indexOf(x) === i; });
        return Promise.all([
          ids.length ? q(sb.from('consumos').select('*').in('reserva_id', ids).eq('anulado', false)) : [],
          ids.length ? q(sb.from('pagos').select('*').in('reserva_id', ids)) : [],
          cliIds.length ? q(sb.from('clientes').select('*').in('id', cliIds)) : [],
          q(sb.from('clientes').select('*').eq('no_grato', true))
        ]).then(function (x) {
          var compIds = x[1].map(function (p) { return p.comprobante_id; }).filter(Boolean);
          return (compIds.length ? q(sb.from('comprobantes').select('*').in('id', compIds)) : Promise.resolve([])).then(function (comps) {
            window.DATOS_HOTEL = {
              hoy: hoy, hora: horaLima(), config: d[0][0] || {}, tipos: d[1], habitaciones: d[2], reservas: res, productos: d[4], personal: d[5],
              temporadas: d[6], origenes: d[7], formas: d[8], motivos: d[9], mesas: d[10], limpieza: d[11], caja: d[12][0] || null,
              consumos: x[0], pagos: x[1], clientes: x[2], noGratos: x[3], comprobantes: comps, usuario: u
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
