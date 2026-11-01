/* Hotel Selva Inn · sistema real (ingreso, usuarios, ajustes y ocupación por piso)
   Lee y guarda en el Supabase del hotel. Sin librerías salvo supabase-js. */
(function () {
  'use strict';

  var CFG = window.CONFIG_HOTEL;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  var ROLES = {
    admin:     { l: 'Administrador', d: 'Todas las funciones y maneja los usuarios' },
    recepcion: { l: 'Recepción',     d: 'PC de recepción. Lo delicado pide la clave' },
    dueno:     { l: 'Dueño',         d: 'Ve todo desde su celular, no cambia nada' }
  };

  var yo = null;          // { id, nombre, rol, correo }
  var usuarios = [];

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iniciales(n) {
    return (String(n || '?').replace(/[^\p{L}\s]/gu, '').trim() || '?').split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
  }
  function fecha(iso) {
    if (!iso) return 'Nunca';
    var d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  var tAviso;
  function aviso(msg) {
    var a = $('#aviso'); a.textContent = msg; a.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(function () { a.hidden = true; }, 3500);
  }

  $('#hotelNombre').textContent = CFG.hotel;
  $('#hotelNombre2').textContent = CFG.hotel;
  $('#hotelLugar').textContent = CFG.lugar;
  $('#hotelLugar2').textContent = CFG.lugar;

  /* ---------------- Ingreso ---------------- */
  function mostrarIngreso(msg) {
    $('#vApp').hidden = true; $('#vIngreso').hidden = false;
    var e = $('#iError'); e.textContent = msg || ''; e.hidden = !msg;
    $('#iEntrar').disabled = false; $('#iEntrar').textContent = 'Entrar';
    setTimeout(function () { $('#iCorreo').focus(); }, 0);
  }

  $('#fIngreso').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var correo = $('#iCorreo').value.trim(), clave = $('#iClave').value;
    if (!correo || !clave) { mostrarIngreso('Escribe tu correo y tu contraseña.'); return; }
    $('#iEntrar').disabled = true; $('#iEntrar').textContent = 'Entrando…';
    sb.auth.signInWithPassword({ email: correo, password: clave }).then(function (r) {
      if (r.error) {
        var m = /banned/i.test(r.error.message) ? 'Esta cuenta está desactivada.' :
          /fetch|network/i.test(r.error.message) ? 'Sin conexión a internet. Intenta de nuevo.' :
          'Correo o contraseña incorrectos.';
        mostrarIngreso(m); return;
      }
      $('#iClave').value = '';
      cargarPerfil(r.data.user);
    });
  });

  function cargarPerfil(user) {
    sb.from('usuarios').select('nombre, rol, activo, correo').eq('id', user.id).maybeSingle().then(function (r) {
      if (r.error || !r.data || !r.data.activo) {
        sb.auth.signOut();
        mostrarIngreso(r.error ? 'No se pudo cargar tu cuenta. Intenta de nuevo.' :
          'Tu cuenta no tiene acceso a este hotel. Pide al administrador que la active.');
        return;
      }
      yo = { id: user.id, nombre: r.data.nombre, rol: r.data.rol, correo: r.data.correo || user.email };
      entrar();
    });
  }

  $('#bSalir').addEventListener('click', function () {
    sb.auth.signOut().then(function () { yo = null; location.hash = ''; mostrarIngreso(); });
  });

  /* ---------------- Sistema ---------------- */
  // Orden del menú. Los módulos en otros archivos se registran con HS.vista(...)
  var VISTAS = {
    inicio:   { l: 'Inicio',   roles: ['admin', 'recepcion', 'dueno'], render: renderInicio, orden: 0 },
    ajustes:  { l: 'Ajustes',  roles: ['admin', 'recepcion'], render: renderAjustes, orden: 90 },
    usuarios: { l: 'Usuarios', roles: ['admin'], render: renderUsuarios, orden: 95 }
  };

  function entrar() {
    aj.pestana = 'datos'; aj.hasta = null;  // cada ingreso empieza de cero
    $('#vIngreso').hidden = true; $('#vApp').hidden = false;
    $('#yoNombre').textContent = yo.nombre;
    $('#yoRol').textContent = ROLES[yo.rol].l;
    $('#yoAv').textContent = iniciales(yo.nombre);
    if (!location.hash && yo.rol === 'admin') location.hash = '#usuarios';
    else mostrarVista();
  }

  function vistaActual() {
    var v = location.hash.replace('#', '').split('/')[0];
    return VISTAS[v] && VISTAS[v].roles.indexOf(yo.rol) >= 0 ? v : 'inicio';
  }

  function mostrarVista() {
    if (!yo) return;
    var v = vistaActual();
    var activa = VISTAS[v].padre || v;
    $('#nav').innerHTML = Object.keys(VISTAS).filter(function (k) {
      return VISTAS[k].roles.indexOf(yo.rol) >= 0 && VISTAS[k].menu !== false;
    }).sort(function (a, b) { return (VISTAS[a].orden != null ? VISTAS[a].orden : 50) - (VISTAS[b].orden != null ? VISTAS[b].orden : 50); }).map(function (k) {
      return '<a href="#' + k + '"' + (k === activa ? ' class="on" aria-current="page"' : '') + '>' + VISTAS[k].l + '</a>';
    }).join('');
    window.scrollTo(0, 0);
    VISTAS[v].render(location.hash.split('/')[1]);
  }
  window.addEventListener('hashchange', mostrarVista);

  /* Mapa de módulos. "conectado" = ya funciona con datos reales.
     El resto se ve en /vista-previa/ (prototipo con datos de ejemplo). */
  var MODULOS = [
    { k: 'inicio',      l: 'Resumen del día',       d: 'Ocupación, llegadas, salidas, ventas y por cobrar.',           roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'panel',       l: 'Panel de habitaciones', d: 'Habitaciones por piso y color de estado; check-in y check-out.', roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'timeline',    l: 'Timeline',              d: 'Calendario del mes con todas las reservas.',                   roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'nueva',       l: 'Nueva reserva',         d: 'Cliente, fechas, habitaciones y precio por temporada.',        roles: ['admin', 'recepcion'] },
    { k: 'reservas',    l: 'Reservas',              d: 'Lista y búsqueda; anular pide la clave.',                      roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'limpieza',    l: 'Limpieza',              d: 'Por limpiar, limpiando y por revisar, con camarera.',          roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'restaurante', l: 'Restaurante',           d: 'Mesas, pedidos, comanda y cargo a la habitación.',             roles: ['admin', 'recepcion'] },
    { k: 'whatsapp',    l: 'WhatsApp',              d: 'Pedidos de reserva: revisar pago, confirmar o rechazar.',      roles: ['admin', 'recepcion'] },
    { k: 'ventas',      l: 'Ventas',                d: 'Boletas y facturas con estado SUNAT, PDF y notas de crédito.', roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'caja',        l: 'Caja',                  d: 'Abrir y cerrar caja, ingresos, salidas y arqueo.',             roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'cierre',      l: 'Cierre del día',        d: 'Revisión de pendientes antes de pasar al día siguiente.',      roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'productos',   l: 'Productos',             d: 'Precios, categorías y listas de precios.',                     roles: ['admin', 'recepcion'] },
    { k: 'almacen',     l: 'Almacén',               d: 'Stock, entradas, salidas y vencimientos.',                     roles: ['admin', 'recepcion'] },
    { k: 'clientes',    l: 'Clientes',              d: 'Fichas, historial y "no grato".',                              roles: ['admin', 'recepcion'] },
    { k: 'reportes',    l: 'Reportes',              d: 'Ocupación, ventas, MINCETUR y caja, con descarga a Excel.',    roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'impresion',   l: 'Impresión',             d: 'Impresoras y cola de tickets y comandas.',                     roles: ['admin', 'recepcion'] },
    { k: 'auditoria',   l: 'Auditoría',             d: 'Todo lo que pasa, con fecha y hora.',                          roles: ['admin', 'recepcion', 'dueno'] },
    { k: 'ajustes',     l: 'Ajustes',               d: 'Datos del hotel, pisos, habitaciones, tarifas y clave.',       roles: ['admin', 'recepcion'], conectado: true },
    { k: 'usuarios',    l: 'Usuarios',              d: 'Cuentas que entran al sistema.',                               roles: ['admin'], conectado: true }
  ];

  function renderInicio() {
    var mios = MODULOS.filter(function (m) { return m.roles.indexOf(yo.rol) >= 0; });
    var listos = mios.filter(function (m) { return m.conectado; }).length;
    var intro = {
      admin: 'Tienes acceso a todo el sistema.',
      recepcion: 'Estos son los módulos de la PC de recepción.',
      dueno: 'Esto es lo que verás desde tu celular. Solo lectura: no cambias nada.'
    }[yo.rol];
    $('#contenido').innerHTML =
      '<div class="cabeza"><div><h1>Hola, ' + esc(yo.nombre) + '</h1>' +
      '<p class="sub">' + esc(ROLES[yo.rol].d) + '.</p></div></div>' +
      '<div class="card bienvenida"><h2>Módulos del sistema</h2>' +
      '<p>' + intro + ' ' + listos + ' de ' + mios.length + ' ya ' + (listos === 1 ? 'funciona' : 'funcionan') +
      ' con datos reales. Los marcados <b>Vista previa</b> abren el diseño final con <b>datos de ejemplo</b>: puedes probarlos, pero nada se guarda.</p></div>' +
      '<section class="card ocupacion" id="ocupacionPisos"><p class="vacio">Cargando la ocupación por piso…</p></section>' +
      '<div class="modulos">' + mios.map(function (m) {
        var href = m.conectado ? '#' + m.k : '/vista-previa/#' + m.k;
        return '<a class="card modulo" href="' + href + '"' + (m.conectado ? '' : ' target="_blank" rel="noopener"') + '>' +
          '<span class="pill ' + (m.conectado ? 'e-on">Conectado' : 'r-dueno">Vista previa') + '</span>' +
          '<b>' + esc(m.l) + '</b><span class="ayuda">' + esc(m.d) + '</span></a>';
      }).join('') + '</div>';
    cargarOcupacionInicio();
  }

  /* ---------------- Usuarios ---------------- */
  function llamar(cuerpo) { return funcion('usuarios', cuerpo); }
  // Llama a una Edge Function del hotel y devuelve sus datos, o lanza { mensaje }
  function funcion(nombre, cuerpo) {
    return sb.functions.invoke(nombre, { body: cuerpo }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (j) {
          throw { mensaje: (j && j.error && j.error.mensaje) || 'No se pudo completar.', campo: j && j.error && j.error.campo };
        }, function () { throw { mensaje: 'No se pudo completar.' }; });
      }
      throw { mensaje: 'Sin conexión con el servidor. Intenta de nuevo.' };
    });
  }

  function renderUsuarios() {
    $('#contenido').innerHTML =
      '<div class="cabeza"><div><h1>Usuarios</h1><p class="sub">Cuentas que pueden entrar al sistema del hotel.</p></div>' +
      '<button class="btn btn-pri" type="button" id="bNuevo">+ Agregar usuario</button></div>' +
      '<div class="card" id="lista"><p class="vacio">Cargando…</p></div>';
    $('#bNuevo').addEventListener('click', modalCrear);
    cargarUsuarios();
  }

  function cargarUsuarios() {
    llamar({ accion: 'listar' }).then(function (d) {
      usuarios = d.usuarios || [];
      pintarUsuarios();
    }, function (e) {
      $('#lista').innerHTML = '<p class="vacio">' + esc(e.mensaje) + '</p>';
    });
  }

  function pintarUsuarios() {
    if (!usuarios.length) { $('#lista').innerHTML = '<p class="vacio">Todavía no hay usuarios.</p>'; return; }
    $('#lista').innerHTML = '<table class="tabla"><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
      usuarios.map(function (u) {
        return '<tr data-id="' + esc(u.id) + '">' +
          '<td><b>' + esc(u.nombre) + (u.id === yo.id ? ' (tú)' : '') + '</b><small>' + esc(u.correo || '') + '</small></td>' +
          '<td class="c-pill"><span class="pill r-' + esc(u.rol) + '">' + esc((ROLES[u.rol] || { l: u.rol }).l) + '</span></td>' +
          '<td class="c-pill"><span class="pill ' + (u.activo ? 'e-on">Activo' : 'e-off">Desactivado') + '</span></td>' +
          '<td class="c-ing">' + esc(fecha(u.ultimo_ingreso)) + '</td>' +
          '<td><div class="acciones"><button class="btn btn-sm" type="button" data-act="editar">Editar</button>' +
          '<button class="btn btn-sm" type="button" data-act="clave">Contraseña</button></div></td></tr>';
      }).join('') + '</tbody></table>';
    $('#lista').querySelectorAll('button[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = usuarios.find(function (x) { return x.id === b.closest('tr').dataset.id; });
        if (b.dataset.act === 'editar') modalEditar(u); else modalClave(u);
      });
    });
  }

  function opcionesRol(sel) {
    return Object.keys(ROLES).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + ROLES[k].l + ' — ' + ROLES[k].d + '</option>';
    }).join('');
  }

  function modalCrear() {
    abrirModal({
      titulo: 'Agregar usuario', ok: 'Crear usuario',
      cuerpo:
        '<label>Nombre<input id="fNombre" type="text" autocomplete="off" placeholder="Ej.: Recepción Selva Inn"></label>' +
        '<label>Correo<input id="fCorreo" type="email" autocomplete="off"></label>' +
        '<label>Rol<select id="fRol">' + opcionesRol('recepcion') + '</select></label>' +
        '<label>Contraseña<input id="fClave" type="password" autocomplete="new-password">' +
        '<span class="ayuda">Mínimo 8 caracteres. Entrégala a la persona en persona, no por chat.</span></label>',
      guardar: function () {
        return llamar({ accion: 'crear', nombre: $('#fNombre').value, correo: $('#fCorreo').value, rol: $('#fRol').value, clave: $('#fClave').value })
          .then(function () { aviso('Usuario creado.'); cargarUsuarios(); });
      }
    });
  }

  function modalEditar(u) {
    var soyYo = u.id === yo.id;
    abrirModal({
      titulo: 'Editar usuario', ok: 'Guardar',
      cuerpo:
        '<p class="ayuda">' + esc(u.correo || '') + '</p>' +
        '<label>Nombre<input id="fNombre" type="text" value="' + esc(u.nombre) + '"></label>' +
        '<label>Rol<select id="fRol"' + (soyYo ? ' disabled' : '') + '>' + opcionesRol(u.rol) + '</select></label>' +
        '<label class="check"><input id="fActivo" type="checkbox"' + (u.activo ? ' checked' : '') + (soyYo ? ' disabled' : '') + '> Puede entrar al sistema</label>' +
        (soyYo ? '<p class="ayuda">No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.</p>' : ''),
      guardar: function () {
        var c = { accion: 'cambiar', id: u.id, nombre: $('#fNombre').value };
        if (!soyYo) { c.rol = $('#fRol').value; c.activo = $('#fActivo').checked; }
        return llamar(c).then(function () {
          if (soyYo) { yo.nombre = c.nombre.trim() || yo.nombre; $('#yoNombre').textContent = yo.nombre; $('#yoAv').textContent = iniciales(yo.nombre); }
          aviso('Cambios guardados.'); cargarUsuarios();
        });
      }
    });
  }

  function modalClave(u) {
    abrirModal({
      titulo: 'Contraseña nueva', ok: 'Cambiar contraseña',
      cuerpo:
        '<p>Para <b>' + esc(u.nombre) + '</b> · ' + esc(u.correo || '') + '</p>' +
        '<label>Contraseña nueva<input id="fClave" type="password" autocomplete="new-password">' +
        '<span class="ayuda">Mínimo 8 caracteres.</span></label>',
      guardar: function () {
        return llamar({ accion: 'clave', id: u.id, clave: $('#fClave').value })
          .then(function () { aviso('Contraseña cambiada.'); });
      }
    });
  }

  /* ---------------- Datos: utilidades ---------------- */
  function hoyLima() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()); }
  function soles(n) { return 'S/ ' + Number(n || 0).toFixed(2); }
  function hora(t) { return t ? String(t).slice(0, 5) : ''; }
  function errorDb(e, ctx) {
    ctx = ctx || {};
    if (!e) return 'No se pudo completar.';
    if (e.code === '23505') return ctx.repetido || 'Ese dato ya existe.';
    if (e.code === '23P01') return ctx.cruce || 'La habitación ya está ocupada o reservada en esas fechas.';
    if (e.code === '23503') return ctx.enUso || 'Está en uso y no se puede borrar.';
    if (e.code === '23514' || e.code === '22P02' || e.code === '22007') return ctx.invalido || 'Algún dato no es válido.';
    if (e.code === '42501') return 'No tienes permiso o la clave de administrador se cerró.';
    if (/fetch|network/i.test(e.message || '')) return 'Sin conexión a internet. Intenta de nuevo.';
    return 'No se pudo guardar.';
  }
  // Ejecuta una consulta y devuelve los datos, o lanza { mensaje }
  function q(consulta, ctx) {
    return consulta.then(function (r) { if (r.error) throw { mensaje: errorDb(r.error, ctx) }; return r.data; },
      function () { throw { mensaje: 'Sin conexión a internet. Intenta de nuevo.' }; });
  }
  // Para update/delete: si RLS no dejó tocar ninguna fila, es falta de permiso
  function qFilas(consulta, ctx) {
    return q(consulta, ctx).then(function (filas) {
      if (!filas || !filas.length) throw { mensaje: 'No tienes permiso o la clave de administrador se cerró.', sinPermiso: true };
      return filas;
    });
  }
  function confirmar(titulo, texto, ok, accion) {
    abrirModal({ titulo: titulo, ok: ok, peligro: true, cuerpo: '<p>' + texto + '</p>', guardar: accion });
  }

  /* ---------------- Hotel: pisos, habitaciones y ocupación de hoy ---------------- */
  var EST_HAB = {
    libre:     { l: 'Libre',          c: 'h-libre' },
    ocupada:   { l: 'Ocupada',        c: 'h-occ' },
    reservada: { l: 'Reservada hoy',  c: 'h-res' },
    fuera:     { l: 'Fuera de venta', c: 'h-fuera' }
  };

  function cargarHotel() {
    var hoy = hoyLima();
    return Promise.all([
      q(sb.from('tipos_habitacion').select('*').order('orden').order('nombre')),
      q(sb.from('habitaciones').select('*').order('piso').order('numero')),
      q(sb.from('reservas').select('habitacion, estado').lte('entrada', hoy).gt('salida', hoy)
        .in('estado', ['reservado', 'confirmado', 'ocupado']))
    ]).then(function (d) {
      var tipos = {};
      d[0].forEach(function (t) { tipos[t.codigo] = t; });
      var hoyRes = {};
      d[2].forEach(function (r) { hoyRes[r.habitacion] = r.estado === 'ocupado' ? 'ocupada' : (hoyRes[r.habitacion] || 'reservada'); });
      return { tiposLista: d[0], tipos: tipos, habs: d[1], hoyRes: hoyRes };
    });
  }
  function estadoHab(h, H) { return h.fuera_de_venta ? 'fuera' : (H.hoyRes[h.numero] || 'libre'); }
  function nombrePiso(p) { return Number(p) === 0 ? 'Otros espacios' : 'Piso ' + p; }
  function nombreTipo(H, c) { return (H.tipos[c] || { nombre: c }).nombre; }
  function ordenNum(a, b) { return String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }); }

  function pisosDe(H) {
    var mapa = {};
    H.habs.forEach(function (h) {
      var p = mapa[h.piso] || (mapa[h.piso] = { piso: Number(h.piso), habs: [], porTipo: {}, venta: 0, ocupadas: 0, reservadas: 0, fuera: 0 });
      p.habs.push(h);
      p.porTipo[h.tipo] = (p.porTipo[h.tipo] || 0) + 1;
      var e = estadoHab(h, H);
      if (e === 'fuera') p.fuera++;
      else { p.venta++; if (e === 'ocupada') p.ocupadas++; if (e === 'reservada') p.reservadas++; }
    });
    return Object.keys(mapa).map(function (k) {
      var p = mapa[k];
      p.habs.sort(ordenNum);
      p.libres = p.venta - p.ocupadas - p.reservadas;
      p.lleno = p.venta > 0 && p.libres <= 0;
      return p;
    }).sort(function (a, b) { return (a.piso === 0) - (b.piso === 0) || a.piso - b.piso; });
  }

  function estadoPisoHtml(p) {
    if (!p.venta) return '<span class="pill e-off">Sin habitaciones a la venta</span>';
    if (p.lleno) return '<span class="pill p-lleno">Lleno</span>';
    return '<span class="pill e-on">' + p.libres + (p.libres === 1 ? ' libre' : ' libres') + '</span>';
  }
  function tiposPisoHtml(p, H) {
    return Object.keys(p.porTipo).sort(function (a, b) { return p.porTipo[b] - p.porTipo[a]; }).map(function (t) {
      return '<span class="chip">' + p.porTipo[t] + ' ' + esc(nombreTipo(H, t)) + '</span>';
    }).join('');
  }
  function cuentaPisoTxt(p) {
    return p.habs.length + (p.habs.length === 1 ? ' habitación' : ' habitaciones') +
      ' · ' + p.ocupadas + (p.ocupadas === 1 ? ' ocupada' : ' ocupadas') +
      (p.reservadas ? ' · ' + p.reservadas + ' reservada' + (p.reservadas === 1 ? '' : 's') + ' hoy' : '') +
      (p.fuera ? ' · ' + p.fuera + ' fuera de venta' : '');
  }

  // Inicio: ocupación por piso (todos los roles)
  function cargarOcupacionInicio() {
    var caja = $('#ocupacionPisos'); if (!caja) return;
    cargarHotel().then(function (H) {
      if (!$('#ocupacionPisos')) return;
      var pisos = pisosDe(H);
      var venta = 0, ocup = 0, res = 0;
      pisos.forEach(function (p) { venta += p.venta; ocup += p.ocupadas; res += p.reservadas; });
      caja.innerHTML = '<div class="op-cab"><div><h2>Ocupación por piso · hoy</h2><p class="ayuda">' +
        ocup + ' ocupadas y ' + res + ' reservadas de ' + venta + ' a la venta.</p></div>' +
        (yo.rol !== 'dueno' ? '<a class="btn btn-sm" href="#ajustes/habitaciones">Ver pisos</a>' : '') + '</div>' +
        '<ul class="op-lista">' + pisos.map(function (p) {
          var pct = p.venta ? Math.round((p.ocupadas + p.reservadas) * 100 / p.venta) : 0;
          return '<li class="' + (p.lleno ? 'lleno' : '') + '"><div class="op-l"><b>' + nombrePiso(p.piso) + '</b>' +
            '<span class="ayuda">' + cuentaPisoTxt(p) + '</span><div class="op-tipos">' + tiposPisoHtml(p, H) + '</div></div>' +
            '<div class="op-r">' + estadoPisoHtml(p) + '<span class="barra" aria-hidden="true"><i data-pct="' + pct + '"></i></span></div></li>';
        }).join('') + '</ul>';
      // El ancho se pone por código: la CSP no permite estilos escritos en el HTML
      caja.querySelectorAll('.barra i').forEach(function (i) { i.style.width = i.dataset.pct + '%'; });
    }, function (e) { caja.innerHTML = '<p class="vacio">' + esc(e.mensaje) + '</p>'; });
  }

  /* ---------------- Ajustes ---------------- */
  var PESTANAS = [
    ['datos', 'Datos del hotel'],
    ['habitaciones', 'Pisos y habitaciones'],
    ['tipos', 'Tipos y tarifas'],
    ['clave', 'Clave de administrador']
  ];
  var aj = { pestana: 'datos', hasta: null };

  function renderAjustes(sub) {
    if (sub && PESTANAS.some(function (p) { return p[0] === sub; })) aj.pestana = sub;
    $('#contenido').innerHTML =
      '<div class="cabeza"><div><h1>Ajustes</h1><p class="sub">Datos del hotel, pisos, habitaciones, tarifas y clave. Todo lo carga el hotel.</p></div>' +
      '<div id="ajClave"></div></div><div id="ajCuerpo"><div class="card vacio">Cargando…</div></div>';
    if (yo.rol === 'admin') { pintarAjustes(); return; }
    q(sb.rpc('admin_abierto')).then(function (abierta) {
      if (abierta) { pintarAjustes(); } else { pedirClave(); }
    }, function (e) { $('#ajCuerpo').innerHTML = '<div class="card vacio">' + esc(e.mensaje) + '</div>'; });
  }

  // Recepción: Ajustes pide la clave de administrador
  function pedirClave(msg) {
    $('#ajClave').innerHTML = '';
    $('#ajCuerpo').innerHTML =
      '<form class="card candado" id="fCandado" novalidate><h2>Ajustes pide la clave de administrador</h2>' +
      '<p class="ayuda">Se abre por 10 minutos. Después de 5 intentos fallidos hay que esperar 1 minuto.</p>' +
      '<label>Clave de administrador<input id="cClave" type="password" autocomplete="off"></label>' +
      '<p class="err" id="cErr"' + (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</p>' +
      '<button class="btn btn-pri" type="submit">Abrir Ajustes</button></form>';
    $('#cClave').focus();
    $('#fCandado').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var b = ev.target.querySelector('button'); b.disabled = true;
      q(sb.rpc('verificar_clave', { p_clave: $('#cClave').value })).then(function (r) {
        b.disabled = false;
        if (r && r.ok) { aj.hasta = r.hasta; pintarAjustes(); return; }
        var m = {
          incorrecta: 'Clave incorrecta. Te quedan ' + (r && r.intentos_restantes) + ' intentos.',
          espera: 'Demasiados intentos. Espera 1 minuto y vuelve a probar.',
          sin_clave: 'Todavía no hay clave de administrador. Pídele al administrador que la cree en Ajustes.',
          sin_permiso: 'Tu cuenta no puede abrir Ajustes.'
        }[r && r.motivo] || 'No se pudo verificar la clave.';
        $('#cErr').textContent = m; $('#cErr').hidden = false; $('#cClave').select();
      }, function (e) { b.disabled = false; $('#cErr').textContent = e.mensaje; $('#cErr').hidden = false; });
    });
  }

  function pintarChipClave() {
    if (yo.rol === 'admin') { $('#ajClave').innerHTML = '<span class="pill r-admin">Administrador · sin clave</span>'; return; }
    var t = aj.hasta ? new Date(aj.hasta).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
    $('#ajClave').innerHTML = '<div class="chip-clave"><span class="pill e-on">Clave abierta' + (t ? ' hasta ' + t : '') + '</span>' +
      '<button class="btn btn-sm" type="button" id="bBloquear">Bloquear</button></div>';
    $('#bBloquear').addEventListener('click', function () {
      q(sb.rpc('bloquear_clave')).then(function () { aj.hasta = null; aviso('Ajustes bloqueado.'); pedirClave(); });
    });
  }
  function renovarClave() {
    if (yo.rol === 'admin') return;
    q(sb.rpc('renovar_clave')).then(function (r) { if (r && r.hasta) { aj.hasta = r.hasta; pintarChipClave(); } }, function () {});
  }
  function falloGuardar(e) { if (e && e.sinPermiso && yo.rol !== 'admin') pedirClave('La clave se cerró. Vuelve a abrirla para seguir.'); throw e; }

  function pintarAjustes() {
    pintarChipClave();
    $('#ajCuerpo').innerHTML =
      '<div class="tabs" role="tablist" aria-label="Secciones de Ajustes">' + PESTANAS.map(function (p) {
        return '<button type="button" role="tab" data-p="' + p[0] + '" aria-selected="' + (p[0] === aj.pestana) + '">' + p[1] + '</button>';
      }).join('') + '</div><div id="ajPanel" role="tabpanel"></div>';
    $('#ajCuerpo').querySelectorAll('[role=tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        aj.pestana = b.dataset.p;
        history.replaceState(null, '', '#ajustes/' + aj.pestana);
        $('#ajCuerpo').querySelectorAll('[role=tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
        pintarPestana();
      });
    });
    pintarPestana();
  }
  function pintarPestana() {
    $('#ajPanel').innerHTML = '<div class="card vacio">Cargando…</div>';
    (PESTANA_FN[aj.pestana] || { datos: pestanaDatos, habitaciones: pestanaHabitaciones, tipos: pestanaTipos, clave: pestanaClave }[aj.pestana])();
  }

  // ---- Datos del hotel ----
  function campo(id, etiqueta, valor, extra, ancho) {
    return '<label' + (ancho ? ' class="ancho"' : '') + '>' + etiqueta + '<input id="' + id + '" value="' + esc(valor == null ? '' : valor) + '" ' + (extra || 'type="text"') + '></label>';
  }
  function pestanaDatos() {
    q(sb.from('config').select('*').eq('id', 1).maybeSingle()).then(function (c) {
      c = c || {};
      $('#ajPanel').innerHTML = '<form id="fDatos" novalidate class="aj-form">' +
        '<section class="card aj-sec"><h2>Datos del hotel</h2><p class="ayuda">Salen en los comprobantes, tickets y reportes.</p><div class="grid2">' +
          campo('dNombre', 'Nombre comercial', c.nombre_comercial) +
          campo('dRazon', 'Razón social', c.razon_social) +
          campo('dRuc', 'RUC', c.ruc, 'type="text" inputmode="numeric" maxlength="11" autocomplete="off"') +
          campo('dTel', 'Teléfono', c.telefono, 'type="tel"') +
          campo('dDir', 'Dirección', c.direccion, 'type="text"', true) +
          campo('dCorreo', 'Correo', c.correo, 'type="email"') +
        '</div></section>' +
        '<section class="card aj-sec"><h2>Facturación</h2>' +
          '<label class="check"><input type="checkbox" id="dAmaz"' + (c.amazonia ? ' checked' : '') + '> Exonerado de IGV por la Ley de la Amazonía (Ley 27037)</label>' +
          '<p class="ayuda" id="dAmazTxt"></p>' +
          '<div class="grid2"><div id="dIgvCaja">' + campo('dIgv', 'IGV (%)', c.igv_pct, 'type="text" inputmode="decimal"') + '</div>' +
          '<label>Comprobante del adelanto<select id="dAdel">' +
            '<option value="al_cobrar"' + (c.adelanto_comprobante === 'al_cobrar' ? ' selected' : '') + '>Al cobrar el adelanto</option>' +
            '<option value="checkout"' + (c.adelanto_comprobante === 'checkout' ? ' selected' : '') + '>En el check-out</option></select></label></div>' +
          '<label class="check"><input type="checkbox" id="dImp"' + (c.impresion_automatica ? ' checked' : '') + '> Imprimir el ticket solo cuando SUNAT lo acepta</label>' +
        '</section>' +
        '<section class="card aj-sec"><h2>Horarios</h2><div class="grid3">' +
          campo('dIn', 'Check-in', hora(c.hora_checkin), 'type="time"') +
          campo('dOut', 'Check-out', hora(c.hora_checkout), 'type="time"') +
          campo('dMax', 'Máximo para salir', hora(c.hora_max_checkout), 'type="time"') +
        '</div></section>' +
        '<p class="err" id="dErr" hidden></p>' +
        '<div class="aj-pie"><button class="btn btn-pri" type="submit" id="dGuardar">Guardar cambios</button></div></form>' +
        '<section class="card aj-sec fact"><h2>Conexión con el facturador electrónico</h2>' +
        '<p class="ayuda">Las llaves se guardan como secretos del servidor (nunca aquí). Prueba la conexión después de configurarlas.</p>' +
        '<div class="acciones"><button class="btn" type="button" id="fProbar">Probar conexión</button>' +
        (yo.rol === 'admin' ? '<button class="btn" type="button" id="fAviso">Activar avisos de SUNAT</button>' : '') + '</div>' +
        '<div id="fRes" class="ayuda"></div></section>';
      function amaz() {
        var on = $('#dAmaz').checked;
        $('#dIgvCaja').hidden = on;
        $('#dAmazTxt').textContent = on
          ? 'El hospedaje y las ventas salen exonerados (código 20) con la leyenda de la Amazonía. En Nooki la empresa también debe estar marcada "Amazonía".'
          : 'Las ventas salen con el IGV de abajo.';
      }
      $('#dAmaz').addEventListener('change', amaz); amaz();
      $('#fProbar').addEventListener('click', function () {
        $('#fRes').textContent = 'Probando…';
        funcion('facturar', { accion: 'probar' }).then(function (r) {
          var e = r.empresa || {}, emp = e.empresa || e;
          $('#fRes').innerHTML = '<span class="pill e-on">Conectado</span> ' + esc([emp.razon_social || emp.nombre, emp.ruc ? 'RUC ' + emp.ruc : '', emp.ambiente ? 'Ambiente: ' + emp.ambiente : '',
            emp.amazonia != null ? 'Amazonía: ' + (emp.amazonia ? 'sí' : 'NO (márcala en Nooki)') : ''].filter(Boolean).join(' · '));
        }, function (e) { $('#fRes').innerHTML = '<span class="pill r-anul">Sin conexión</span> ' + esc(e.mensaje); });
      });
      if ($('#fAviso')) $('#fAviso').addEventListener('click', function () {
        funcion('facturar', { accion: 'configurar_aviso' }).then(function (r) { $('#fRes').innerHTML = '<span class="pill e-on">Avisos activados</span> ' + esc(r.url); },
          function (e) { $('#fRes').innerHTML = '<span class="pill r-anul">No se pudo</span> ' + esc(e.mensaje); });
      });
      $('#fDatos').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var err = $('#dErr'); err.hidden = true;
        var ruc = $('#dRuc').value.trim(), correo = $('#dCorreo').value.trim(), igv = $('#dIgv').value.trim().replace(',', '.');
        var malo = !$('#dNombre').value.trim() ? 'Escribe el nombre comercial.' :
          (ruc && !/^\d{11}$/.test(ruc)) ? 'El RUC debe tener 11 números.' :
          (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) ? 'El correo no es válido.' :
          (!$('#dAmaz').checked && !(Number(igv) >= 0 && Number(igv) <= 30)) ? 'El IGV debe ser un número entre 0 y 30.' : '';
        if (malo) { err.textContent = malo; err.hidden = false; return; }
        var cambios = {
          nombre_comercial: $('#dNombre').value.trim(), razon_social: $('#dRazon').value.trim() || null,
          ruc: ruc || null, telefono: $('#dTel').value.trim() || null, direccion: $('#dDir').value.trim() || null,
          correo: correo || null, amazonia: $('#dAmaz').checked, adelanto_comprobante: $('#dAdel').value,
          impresion_automatica: $('#dImp').checked,
          hora_checkin: $('#dIn').value || '09:00', hora_checkout: $('#dOut').value || '11:00', hora_max_checkout: $('#dMax').value || '11:30'
        };
        if (!cambios.amazonia) cambios.igv_pct = Number(igv);
        $('#dGuardar').disabled = true;
        qFilas(sb.from('config').update(cambios).eq('id', 1).select(), { invalido: 'Revisa los datos: alguno no es válido.' })
          .then(function () { aviso('Datos del hotel guardados.'); renovarClave(); })
          .catch(function (e) { err.textContent = e.mensaje; err.hidden = false; try { falloGuardar(e); } catch (x) { /* ya avisado */ } })
          .then(function () { var b = $('#dGuardar'); if (b) b.disabled = false; });
      });
    }, function (e) { $('#ajPanel').innerHTML = '<div class="card vacio">' + esc(e.mensaje) + '</div>'; });
  }

  // ---- Pisos y habitaciones ----
  var H = null;
  function pestanaHabitaciones() {
    cargarHotel().then(function (datos) {
      H = datos;
      var pisos = pisosDe(H);
      var tot = { habs: H.habs.length, venta: 0, ocup: 0, res: 0, llenos: 0 };
      pisos.forEach(function (p) { tot.venta += p.venta; tot.ocup += p.ocupadas; tot.res += p.reservadas; if (p.lleno) tot.llenos++; });
      $('#ajPanel').innerHTML =
        '<div class="aj-barra"><div class="resumen">' +
          '<span><b>' + pisos.length + '</b> pisos</span><span><b>' + tot.habs + '</b> habitaciones</span>' +
          '<span><b>' + tot.venta + '</b> a la venta</span><span><b>' + tot.ocup + '</b> ocupadas hoy</span>' +
          (tot.llenos ? '<span class="p-lleno-txt"><b>' + tot.llenos + '</b> ' + (tot.llenos === 1 ? 'piso lleno' : 'pisos llenos') + '</span>' : '') +
        '</div><button class="btn btn-pri" type="button" id="bAgregarHab">+ Agregar habitaciones</button></div>' +
        (pisos.length ? '' : '<div class="card vacio">Todavía no hay habitaciones. Agrega la primera.</div>') +
        pisos.map(function (p) {
          return '<section class="card piso' + (p.lleno ? ' lleno' : '') + '"><div class="piso-cab"><div><h2>' + nombrePiso(p.piso) + '</h2>' +
            '<p class="ayuda">' + cuentaPisoTxt(p) + '</p></div>' + estadoPisoHtml(p) + '</div>' +
            '<div class="op-tipos">' + tiposPisoHtml(p, H) + '</div>' +
            '<div class="habs">' + p.habs.map(function (h) {
              var e = EST_HAB[estadoHab(h, H)];
              return '<button type="button" class="hab ' + e.c + '" data-n="' + esc(h.numero) + '" aria-label="Habitación ' + esc(h.numero) + ', ' + esc(nombreTipo(H, h.tipo)) + ', ' + e.l + '">' +
                '<b>' + esc(h.numero) + '</b><span>' + esc(nombreTipo(H, h.tipo)) + '</span><i>' + e.l + '</i></button>';
            }).join('') + '</div></section>';
        }).join('');
      $('#bAgregarHab').addEventListener('click', modalAgregarHabs);
      $('#ajPanel').querySelectorAll('.hab').forEach(function (b) {
        b.addEventListener('click', function () { modalHab(H.habs.find(function (h) { return h.numero === b.dataset.n; })); });
      });
    }, function (e) { $('#ajPanel').innerHTML = '<div class="card vacio">' + esc(e.mensaje) + '</div>'; });
  }

  function opcionesTipo(sel) {
    return H.tiposLista.map(function (t) {
      return '<option value="' + esc(t.codigo) + '"' + (t.codigo === sel ? ' selected' : '') + '>' + esc(t.nombre) + ' · ' + soles(t.tarifa) + '</option>';
    }).join('');
  }

  // "501", "501 a 510", "501-510", "101, 102, 105", "101 102"
  function leerNumeros(txt) {
    var out = [], malo = false;
    String(txt).split(/[,;]+/).forEach(function (parte) {
      parte = parte.trim(); if (!parte) return;
      var m = parte.match(/^(\d+)\s*(?:a|al|hasta|-)\s*(\d+)$/i);
      if (m) {
        var a = Number(m[1]), b = Number(m[2]);
        if (b < a || b - a > 200) { malo = true; return; }
        for (var i = a; i <= b; i++) out.push(String(i));
        return;
      }
      parte.split(/\s+/).forEach(function (n) {
        if (/^[A-Za-z0-9-]{1,10}$/.test(n)) out.push(n.toUpperCase()); else malo = true;
      });
    });
    return malo ? null : out.filter(function (n, i) { return out.indexOf(n) === i; });
  }
  function pisoSugerido(n) { var v = Number(n); return isFinite(v) && v >= 100 ? Math.floor(v / 100) : 0; }

  function modalAgregarHabs() {
    if (!H.tiposLista.length) { aviso('Primero crea un tipo de habitación en "Tipos y tarifas".'); return; }
    abrirModal({
      titulo: 'Agregar habitaciones', ok: 'Agregar',
      cuerpo:
        '<label>Números<input id="fNums" type="text" autocomplete="off" placeholder="Ej.: 501  ·  501 a 510  ·  501, 503, 507">' +
        '<span class="ayuda">Una, varias separadas por coma, o un rango con "a".</span></label>' +
        '<label>Tipo<select id="fTipo">' + opcionesTipo() + '</select></label>' +
        '<label>Piso<input id="fPiso" type="number" min="0" max="99" inputmode="numeric" placeholder="Se toma del número (501 → piso 5)">' +
        '<span class="ayuda">Usa 0 para espacios sin piso (auditorio, salones).</span></label>',
      guardar: function () {
        var nums = leerNumeros($('#fNums').value);
        if (!nums || !nums.length) return Promise.reject({ mensaje: 'Escribe los números de habitación (por ejemplo 501 o 501 a 510).' });
        var pisoTxt = $('#fPiso').value.trim();
        var filas = nums.map(function (n) {
          return { numero: n, tipo: $('#fTipo').value, piso: pisoTxt === '' ? pisoSugerido(n) : Number(pisoTxt) };
        });
        return q(sb.from('habitaciones').insert(filas).select(), { repetido: 'Alguna de esas habitaciones ya existe.' })
          .then(function () { aviso(filas.length === 1 ? 'Habitación ' + nums[0] + ' agregada.' : filas.length + ' habitaciones agregadas.'); renovarClave(); pestanaHabitaciones(); })
          .catch(falloGuardar);
      }
    });
  }

  function modalHab(h) {
    abrirModal({
      titulo: 'Habitación ' + h.numero, ok: 'Guardar',
      cuerpo:
        '<p class="ayuda">Estado hoy: ' + EST_HAB[estadoHab(h, H)].l + '</p>' +
        '<label>Tipo<select id="fTipo">' + opcionesTipo(h.tipo) + '</select></label>' +
        '<label>Piso<input id="fPiso" type="number" min="0" max="99" inputmode="numeric" value="' + esc(h.piso) + '"></label>' +
        '<label class="check"><input id="fFuera" type="checkbox"' + (h.fuera_de_venta ? ' checked' : '') + '> Fuera de venta (mantenimiento, uso interno)</label>' +
        '<label>Notas<input id="fNotas" type="text" value="' + esc(h.notas || '') + '" placeholder="Opcional"></label>' +
        '<button type="button" class="btn btn-peligro btn-sm" id="fEliminar">Eliminar habitación</button>',
      guardar: function () {
        var piso = Number($('#fPiso').value);
        if (!(piso >= 0 && piso <= 99)) return Promise.reject({ mensaje: 'El piso debe ser un número de 0 a 99.' });
        var cambios = { tipo: $('#fTipo').value, piso: piso, fuera_de_venta: $('#fFuera').checked, notas: $('#fNotas').value.trim() || null };
        return qFilas(sb.from('habitaciones').update(cambios).eq('numero', h.numero).select())
          .then(function () { aviso('Habitación ' + h.numero + ' guardada.'); renovarClave(); pestanaHabitaciones(); })
          .catch(falloGuardar);
      }
    });
    $('#fEliminar').addEventListener('click', function () {
      confirmar('Eliminar habitación ' + h.numero,
        'Solo se puede eliminar si nunca tuvo reservas. Si ya tuvo, márcala como <b>Fuera de venta</b>.', 'Eliminar', function () {
          return qFilas(sb.from('habitaciones').delete().eq('numero', h.numero).select(),
            { enUso: 'La habitación ' + h.numero + ' ya tuvo reservas o tareas: márcala como Fuera de venta en vez de eliminarla.' })
            .then(function () { aviso('Habitación ' + h.numero + ' eliminada.'); renovarClave(); pestanaHabitaciones(); })
            .catch(falloGuardar);
        });
    });
  }

  // ---- Tipos y tarifas ----
  function pestanaTipos() {
    cargarHotel().then(function (datos) {
      H = datos;
      var usados = {};
      H.habs.forEach(function (h) { usados[h.tipo] = (usados[h.tipo] || 0) + 1; });
      $('#ajPanel').innerHTML =
        '<div class="aj-barra"><p class="ayuda">La tarifa es el precio por noche. Las temporadas la suben o bajan.</p>' +
        '<button class="btn btn-pri" type="button" id="bAgregarTipo">+ Agregar tipo</button></div>' +
        '<div class="card">' + (H.tiposLista.length ? '<table class="tabla"><thead><tr><th>Tipo</th><th>Tarifa por noche</th><th>Camas</th><th>Personas</th><th>Habitaciones</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
        H.tiposLista.map(function (t) {
          return '<tr data-c="' + esc(t.codigo) + '"><td><b>' + esc(t.nombre) + '</b></td><td class="c-dato" data-l="Tarifa">' + soles(t.tarifa) + '</td>' +
            '<td class="c-dato" data-l="Camas">' + t.camas + '</td><td class="c-dato" data-l="Personas">hasta ' + t.capacidad + '</td>' +
            '<td class="c-dato" data-l="Habitaciones">' + (usados[t.codigo] || 0) + '</td>' +
            '<td><div class="acciones"><button class="btn btn-sm" type="button" data-act="editar">Editar</button>' +
            '<button class="btn btn-sm" type="button" data-act="eliminar">Eliminar</button></div></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="vacio">Todavía no hay tipos de habitación.</p>') + '</div>';
      $('#bAgregarTipo').addEventListener('click', function () { modalTipo(null); });
      $('#ajPanel').querySelectorAll('button[data-act]').forEach(function (b) {
        var t = H.tipos[b.closest('tr').dataset.c];
        b.addEventListener('click', function () {
          if (b.dataset.act === 'editar') { modalTipo(t); return; }
          confirmar('Eliminar tipo "' + t.nombre + '"', usados[t.codigo] ? 'Hay ' + usados[t.codigo] + ' habitaciones de este tipo: primero cámbialas a otro tipo.' : '¿Seguro? Esta acción queda en la auditoría.', 'Eliminar', function () {
            return qFilas(sb.from('tipos_habitacion').delete().eq('codigo', t.codigo).select(),
              { enUso: 'Hay habitaciones o reservas de este tipo: cámbialas primero a otro tipo.' })
              .then(function () { aviso('Tipo eliminado.'); renovarClave(); pestanaTipos(); })
              .catch(falloGuardar);
          });
        });
      });
    }, function (e) { $('#ajPanel').innerHTML = '<div class="card vacio">' + esc(e.mensaje) + '</div>'; });
  }

  function codigoTipo(nombre) {
    var base = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).join('').slice(0, 4) || 'T';
    var c = base, i = 2;
    while (H.tipos[c]) c = base + (i++);
    return c;
  }

  function modalTipo(t) {
    abrirModal({
      titulo: t ? 'Editar tipo' : 'Agregar tipo de habitación', ok: t ? 'Guardar' : 'Agregar',
      cuerpo:
        '<label>Nombre<input id="fNom" type="text" value="' + esc(t ? t.nombre : '') + '" placeholder="Ej.: Suite Matrimonial"></label>' +
        '<label>Tarifa por noche (S/)<input id="fTar" type="text" inputmode="decimal" value="' + esc(t ? t.tarifa : '') + '"></label>' +
        '<div class="grid2"><label>Camas<input id="fCam" type="number" min="0" max="20" value="' + esc(t ? t.camas : 1) + '"></label>' +
        '<label>Personas (máximo)<input id="fCap" type="number" min="1" max="200" value="' + esc(t ? t.capacidad : 2) + '"></label></div>',
      guardar: function () {
        var nombre = $('#fNom').value.trim(), tarifa = Number($('#fTar').value.replace(',', '.')),
          camas = Number($('#fCam').value), cap = Number($('#fCap').value);
        if (!nombre) return Promise.reject({ mensaje: 'Escribe el nombre del tipo.' });
        if (!(tarifa >= 0)) return Promise.reject({ mensaje: 'La tarifa debe ser un número (por ejemplo 180 o 180.50).' });
        if (!(camas >= 0) || !(cap >= 1)) return Promise.reject({ mensaje: 'Revisa camas y personas.' });
        var datos = { nombre: nombre, tarifa: tarifa, camas: camas, capacidad: cap };
        var ctx = { repetido: 'Ya hay un tipo con ese nombre.' };
        var op = t
          ? qFilas(sb.from('tipos_habitacion').update(datos).eq('codigo', t.codigo).select(), ctx)
          : q(sb.from('tipos_habitacion').insert(Object.assign({ codigo: codigoTipo(nombre), orden: H.tiposLista.length + 1 }, datos)).select(), ctx);
        return op.then(function () { aviso(t ? 'Tipo guardado.' : 'Tipo agregado.'); renovarClave(); pestanaTipos(); }).catch(falloGuardar);
      }
    });
  }

  // ---- Clave de administrador ----
  function pestanaClave() {
    q(sb.rpc('hay_clave')).then(function (hay) {
      var pideActual = hay && yo.rol !== 'admin';
      $('#ajPanel').innerHTML = '<form class="card aj-sec angosto" id="fClaveAdm" novalidate>' +
        '<h2>' + (hay ? 'Cambiar la clave de administrador' : 'Crear la clave de administrador') + '</h2>' +
        '<p class="ayuda">' + (hay
          ? 'Se pide para entrar a Ajustes, anular comprobantes y reservas y cambiar precios.' + (yo.rol === 'admin' ? ' Como administrador puedes poner una nueva sin saber la anterior.' : '')
          : 'Todavía no hay clave. Se pedirá para entrar a Ajustes, anular comprobantes y reservas y cambiar precios.') + '</p>' +
        (pideActual ? '<label>Clave actual<input id="kAct" type="password" autocomplete="off"></label>' : '') +
        '<label>Clave nueva<input id="kNue" type="password" autocomplete="new-password"><span class="ayuda">Mínimo 4 caracteres. No la compartas por chat.</span></label>' +
        '<label>Repite la clave nueva<input id="kRep" type="password" autocomplete="new-password"></label>' +
        '<p class="err" id="kErr" hidden></p><div class="aj-pie"><button class="btn btn-pri" type="submit">' + (hay ? 'Cambiar clave' : 'Crear clave') + '</button></div></form>';
      $('#fClaveAdm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var err = $('#kErr'); err.hidden = true;
        var nueva = $('#kNue').value;
        if (nueva.length < 4) { err.textContent = 'La clave debe tener al menos 4 caracteres.'; err.hidden = false; return; }
        if (nueva !== $('#kRep').value) { err.textContent = 'Las dos claves nuevas no son iguales.'; err.hidden = false; return; }
        q(sb.rpc('cambiar_clave', { p_actual: pideActual ? $('#kAct').value : null, p_nueva: nueva })).then(function (r) {
          if (r && r.ok) { aviso(hay ? 'Clave cambiada.' : 'Clave creada.'); pestanaClave(); return; }
          err.textContent = {
            actual_incorrecta: 'La clave actual no es correcta.', clave_cerrada: 'La clave se cerró. Vuelve a abrir Ajustes.',
            muy_corta: 'La clave debe tener al menos 4 caracteres.', sin_permiso: 'Tu cuenta no puede cambiar la clave.'
          }[r && r.motivo] || 'No se pudo cambiar la clave.';
          err.hidden = false;
        }, function (e) { err.textContent = e.mensaje; err.hidden = false; });
      });
    }, function (e) { $('#ajPanel').innerHTML = '<div class="card vacio">' + esc(e.mensaje) + '</div>'; });
  }

  // Ejecuta "accion" si la clave está abierta (o es admin); si no, la pide en una ventana.
  function conClave(motivo, accion) {
    if (yo.rol === 'admin') return accion();
    q(sb.rpc('admin_abierto')).then(function (abierta) {
      if (abierta) { accion(); return; }
      abrirModal({
        titulo: 'Clave de administrador', ok: 'Continuar',
        cuerpo: '<p>' + esc(motivo) + ' pide la clave de administrador.</p><label>Clave<input id="fClaveAdm" type="password" autocomplete="off"></label>',
        guardar: function () {
          return q(sb.rpc('verificar_clave', { p_clave: $('#fClaveAdm').value })).then(function (r) {
            if (r && r.ok) { aj.hasta = r.hasta; setTimeout(accion, 0); return; }
            throw { mensaje: { incorrecta: 'Clave incorrecta. Te quedan ' + (r && r.intentos_restantes) + ' intentos.', espera: 'Demasiados intentos. Espera 1 minuto.',
              sin_clave: 'Todavía no hay clave de administrador: créala en Ajustes.', sin_permiso: 'Tu cuenta no puede hacer esto.' }[r && r.motivo] || 'No se pudo verificar la clave.' };
          });
        }
      });
    }, function (e) { aviso(e.mensaje); });
  }

  /* ---------------- Ventana ---------------- */
  var modalActual = null, focoAntes = null;
  function abrirModal(m) {
    modalActual = m; focoAntes = document.activeElement;
    $('#mTitulo').textContent = m.titulo;
    $('#mCuerpo').innerHTML = m.cuerpo;
    $('#mOk').textContent = m.ok; $('#mOk').disabled = false;
    $('#mOk').classList.toggle('btn-peligro', !!m.peligro); $('#mOk').classList.toggle('btn-pri', !m.peligro);
    $('#mError').hidden = true;
    $('#velo').hidden = false;
    var primero = $('#mCuerpo').querySelector('input:not([disabled]),select:not([disabled])');
    if (primero) primero.focus();
  }
  function cerrarModal() {
    $('#velo').hidden = true; modalActual = null;
    if (focoAntes && focoAntes.focus) focoAntes.focus();
  }
  $('#mCerrar').addEventListener('click', cerrarModal);
  $('#mCancelar').addEventListener('click', cerrarModal);
  $('#velo').addEventListener('click', function (e) { if (e.target === $('#velo')) cerrarModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalActual) cerrarModal(); });
  $('#mForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!modalActual) return;
    $('#mOk').disabled = true; $('#mError').hidden = true;
    modalActual.guardar().then(cerrarModal, function (err) {
      $('#mOk').disabled = false;
      $('#mError').textContent = (err && err.mensaje) || 'No se pudo guardar.';
      $('#mError').hidden = false;
    });
  });

  /* ---------------- API para los módulos (reservas.js, caja.js, …) ---------------- */
  window.HS = {
    sb: sb, $: $, esc: esc, q: q, qFilas: qFilas, aviso: aviso, abrirModal: abrirModal, cerrarModal: cerrarModal,
    confirmar: confirmar, conClave: conClave, renovarClave: renovarClave, hoyLima: hoyLima, soles: soles, hora: hora, fecha: fecha,
    cargarHotel: cargarHotel, pisosDe: pisosDe, estadoHab: estadoHab, nombrePiso: nombrePiso, nombreTipo: nombreTipo, EST_HAB: EST_HAB,
    estadoPisoHtml: estadoPisoHtml, tiposPisoHtml: tiposPisoHtml, cuentaPisoTxt: cuentaPisoTxt, leerNumeros: leerNumeros,
    yo: function () { return yo; },
    vista: function (k, def) { VISTAS[k] = def; },
    conectar: function (k) { MODULOS.forEach(function (m) { if (m.k === k) m.conectado = true; }); },
    ir: function (h) { if (location.hash === h) mostrarVista(); else location.hash = h; },
    refrescar: function () { mostrarVista(); },
    pestanaAjustes: function (k, l, fn) { PESTANAS.splice(PESTANAS.length - 1, 0, [k, l]); PESTANA_FN[k] = fn; },
    funcion: funcion,
    facturar: function (cuerpo) { return funcion('facturar', cuerpo); }
  };
  var PESTANA_FN = {};

  /* ---------------- Arranque ---------------- */
  window.addEventListener('load', function () { sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) cargarPerfil(s.user); else mostrarIngreso();
  }); });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'SIGNED_OUT' && yo) { yo = null; mostrarIngreso('Tu sesión terminó. Vuelve a entrar.'); }
  });
})();
