/* Nooki Hotel · sistema real (primera parte: ingreso y usuarios)
   Lee y guarda en el Supabase del hotel. Sin librerías salvo supabase-js. */
(function () {
  'use strict';

  var CFG = window.NOOKI_HOTEL;
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
  var VISTAS = {
    inicio:   { l: 'Inicio',   roles: ['admin', 'recepcion', 'dueno'], render: renderInicio },
    usuarios: { l: 'Usuarios', roles: ['admin'], render: renderUsuarios }
  };

  function entrar() {
    $('#vIngreso').hidden = true; $('#vApp').hidden = false;
    $('#yoNombre').textContent = yo.nombre;
    $('#yoRol').textContent = ROLES[yo.rol].l;
    $('#yoAv').textContent = iniciales(yo.nombre);
    if (!location.hash && yo.rol === 'admin') location.hash = '#usuarios';
    else mostrarVista();
  }

  function vistaActual() {
    var v = location.hash.replace('#', '');
    return VISTAS[v] && VISTAS[v].roles.indexOf(yo.rol) >= 0 ? v : 'inicio';
  }

  function mostrarVista() {
    if (!yo) return;
    var v = vistaActual();
    $('#nav').innerHTML = Object.keys(VISTAS).filter(function (k) {
      return VISTAS[k].roles.indexOf(yo.rol) >= 0;
    }).map(function (k) {
      return '<a href="#' + k + '"' + (k === v ? ' class="on" aria-current="page"' : '') + '>' + VISTAS[k].l + '</a>';
    }).join('');
    VISTAS[v].render();
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
    { k: 'ajustes',     l: 'Ajustes',               d: 'Empresa, facturación, habitaciones, tarifas y clave.',         roles: ['admin', 'recepcion'] },
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
      '<div class="modulos">' + mios.map(function (m) {
        var href = m.conectado ? '#' + m.k : '/vista-previa/#' + m.k;
        return '<a class="card modulo" href="' + href + '"' + (m.conectado ? '' : ' target="_blank" rel="noopener"') + '>' +
          '<span class="pill ' + (m.conectado ? 'e-on">Conectado' : 'r-dueno">Vista previa') + '</span>' +
          '<b>' + esc(m.l) + '</b><span class="ayuda">' + esc(m.d) + '</span></a>';
      }).join('') + '</div>';
  }

  /* ---------------- Usuarios ---------------- */
  function llamar(cuerpo) {
    return sb.functions.invoke('usuarios', { body: cuerpo }).then(function (r) {
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

  /* ---------------- Ventana ---------------- */
  var modalActual = null, focoAntes = null;
  function abrirModal(m) {
    modalActual = m; focoAntes = document.activeElement;
    $('#mTitulo').textContent = m.titulo;
    $('#mCuerpo').innerHTML = m.cuerpo;
    $('#mOk').textContent = m.ok; $('#mOk').disabled = false;
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

  /* ---------------- Arranque ---------------- */
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) cargarPerfil(s.user); else mostrarIngreso();
  });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'SIGNED_OUT' && yo) { yo = null; mostrarIngreso('Tu sesión terminó. Vuelve a entrar.'); }
  });
})();
