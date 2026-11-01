/* Hotel Selva Inn · Ingreso: inicia sesión y entra al sistema (app/index.html) */
(function () {
  'use strict';
  var C = window.CONFIG_HOTEL, sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  function $(s) { return document.querySelector(s); }
  function error(m) { $('#iError').textContent = m; $('#iError').hidden = !m; $('#iEntrar').disabled = false; $('#iEntrar').textContent = 'Entrar'; }
  function revisar(user) {
    return sb.from('usuarios').select('activo').eq('id', user.id).then(function (r) {
      if (r.error || !r.data || !r.data[0] || !r.data[0].activo) { sb.auth.signOut(); error('Tu cuenta no tiene acceso a este hotel. Pide al administrador que la active.'); return; }
      location.replace('/');
    });
  }
  if (/sin_acceso/.test(location.search)) error('Tu cuenta no tiene acceso a este hotel. Pide al administrador que la active.');
  else sb.auth.getSession().then(function (r) { var s = r.data && r.data.session; if (s) revisar(s.user); });
  $('#iCorreo').focus();
  $('#fIngreso').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var correo = $('#iCorreo').value.trim(), clave = $('#iClave').value;
    if (!correo || !clave) { error('Escribe tu correo y tu contraseña.'); return; }
    $('#iEntrar').disabled = true; $('#iEntrar').textContent = 'Entrando…';
    sb.auth.signInWithPassword({ email: correo, password: clave }).then(function (r) {
      if (r.error) {
        error(/banned/i.test(r.error.message) ? 'Esta cuenta está desactivada.' : /fetch|network/i.test(r.error.message) ? 'Sin conexión a internet. Intenta de nuevo.' : 'Correo o contraseña incorrectos.');
        return;
      }
      revisar(r.data.user);
    });
  });
})();
