-- 0004 · Seguridad (RLS), permisos y auditoría automática
--
-- Reglas:
--  · Nadie sin sesión (anon) ve nada.
--  · Usuarios del hotel (recepción y dueño) leen todo lo operativo.
--  · Solo recepción escribe. El dueño es solo lectura.
--  · Ajustes (config, habitaciones, tarifas, series, personal…) piden además la clave abierta.
--  · Comprobantes y avisos de Nooki solo los escribe el servidor.
--  · Auditoría: se lee y se agrega; nunca se edita ni se borra.

do $$
declare
  t text;
  todas text[] := array[
    'config', 'series', 'tipos_habitacion', 'habitaciones', 'temporadas', 'origenes', 'formas_pago',
    'motivos_viaje', 'motivos_caja', 'personal', 'mesas', 'impresoras',
    'clientes', 'productos', 'movimientos_stock', 'reservas', 'reserva_huespedes', 'pedidos', 'pedido_items',
    'consumos', 'caja_turnos', 'comprobantes', 'pagos', 'caja_movimientos', 'limpieza', 'cierres',
    'pedidos_whatsapp', 'avisos_nooki', 'usuarios', 'auditoria'
  ];
  -- Recepción agrega y modifica (sin clave)
  operacion text[] := array[
    'clientes', 'productos', 'movimientos_stock', 'reservas', 'reserva_huespedes', 'pedidos', 'pedido_items',
    'consumos', 'caja_turnos', 'pagos', 'caja_movimientos', 'limpieza', 'cierres', 'pedidos_whatsapp'
  ];
  -- Recepción también puede borrar (cosas que se quitan antes de confirmarse)
  se_borran text[] := array['reserva_huespedes', 'pedido_items'];
  -- Ajustes: con clave de administrador abierta
  ajustes text[] := array[
    'config', 'series', 'tipos_habitacion', 'habitaciones', 'temporadas', 'origenes', 'formas_pago',
    'motivos_viaje', 'motivos_caja', 'personal', 'mesas', 'impresoras'
  ];
begin
  foreach t in array todas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy leer on public.%I for select to authenticated using ((select public.es_usuario_hotel()))', t);
  end loop;

  foreach t in array operacion loop
    execute format(
      'create policy agregar on public.%I for insert to authenticated with check ((select public.puede_operar()))', t);
    execute format(
      'create policy modificar on public.%I for update to authenticated using ((select public.puede_operar())) with check ((select public.puede_operar()))', t);
  end loop;

  foreach t in array se_borran loop
    execute format(
      'create policy borrar on public.%I for delete to authenticated using ((select public.puede_operar()))', t);
  end loop;

  foreach t in array ajustes loop
    execute format(
      'create policy agregar on public.%I for insert to authenticated with check ((select public.puede_operar()) and (select public.admin_abierto()))', t);
    execute format(
      'create policy modificar on public.%I for update to authenticated using ((select public.puede_operar()) and (select public.admin_abierto())) with check ((select public.puede_operar()) and (select public.admin_abierto()))', t);
    execute format(
      'create policy borrar on public.%I for delete to authenticated using ((select public.puede_operar()) and (select public.admin_abierto()))', t);
  end loop;
end $$;

-- Auditoría: el navegador puede agregar eventos propios (no de clave ni SUNAT)
create policy agregar on public.auditoria for insert to authenticated
  with check (
    (select public.es_usuario_hotel())
    and usuario_id = (select auth.uid())
    and tipo in ('cambio', 'alerta')
    and con_clave = false
    and tabla is null
  );
revoke update, delete, truncate on public.auditoria from authenticated;

-- Comprobantes y avisos: el navegador solo lee
revoke insert, update, delete, truncate on public.comprobantes, public.avisos_nooki from authenticated;
-- Usuarios: se dan de alta desde el servidor
revoke insert, update, delete, truncate on public.usuarios from authenticated;

-- ---------------------------------------------------------------
-- Funciones: solo usuarios con sesión las pueden llamar
-- ---------------------------------------------------------------
revoke execute on function
  public.mi_rol(), public.es_usuario_hotel(), public.puede_operar(), public.admin_abierto(),
  public.verificar_clave(text), public.renovar_clave(), public.bloquear_clave(),
  public.cambiar_clave(text, text), public.hay_clave()
from public, anon;
grant execute on function
  public.mi_rol(), public.es_usuario_hotel(), public.puede_operar(), public.admin_abierto(),
  public.verificar_clave(text), public.renovar_clave(), public.bloquear_clave(),
  public.cambiar_clave(text, text), public.hay_clave()
to authenticated;

-- Funciones de disparadores: nadie las llama directo
revoke execute on function
  public.auditar(), public.auditoria_bloquear(), public.poner_actualizado_en(),
  public.aplicar_movimiento_stock(), public.reservas_pide_clave()
from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Auditoría automática de cada tabla importante
-- ---------------------------------------------------------------
create trigger auditar after insert or update or delete on public.config
  for each row execute function public.auditar('Ajustes');
create trigger auditar after insert or update or delete on public.series
  for each row execute function public.auditar('Ajustes', 'serie');
create trigger auditar after insert or update or delete on public.tipos_habitacion
  for each row execute function public.auditar('Ajustes', 'codigo');
create trigger auditar after insert or update or delete on public.habitaciones
  for each row execute function public.auditar('Ajustes', 'numero');
create trigger auditar after insert or update or delete on public.temporadas
  for each row execute function public.auditar('Ajustes');
create trigger auditar after insert or update or delete on public.origenes
  for each row execute function public.auditar('Ajustes', 'nombre');
create trigger auditar after insert or update or delete on public.formas_pago
  for each row execute function public.auditar('Ajustes', 'nombre');
create trigger auditar after insert or update or delete on public.personal
  for each row execute function public.auditar('Ajustes');
create trigger auditar after insert or update or delete on public.mesas
  for each row execute function public.auditar('Ajustes');
create trigger auditar after insert or update or delete on public.usuarios
  for each row execute function public.auditar('Usuarios');
create trigger auditar after insert or update or delete on public.clientes
  for each row execute function public.auditar('Clientes');
create trigger auditar after insert or update or delete on public.productos
  for each row execute function public.auditar('Productos');
create trigger auditar after insert on public.movimientos_stock
  for each row execute function public.auditar('Almacén');
create trigger auditar after insert or update or delete on public.reservas
  for each row execute function public.auditar('Reservas');
create trigger auditar after insert or update or delete on public.consumos
  for each row execute function public.auditar('Reservas');
create trigger auditar after insert or update or delete on public.pedidos
  for each row execute function public.auditar('Restaurante');
create trigger auditar after insert or update or delete on public.caja_turnos
  for each row execute function public.auditar('Caja');
create trigger auditar after insert or update or delete on public.caja_movimientos
  for each row execute function public.auditar('Caja');
create trigger auditar after insert or update or delete on public.pagos
  for each row execute function public.auditar('Caja');
create trigger auditar after insert or update or delete on public.comprobantes
  for each row execute function public.auditar('Ventas');
create trigger auditar after insert or update or delete on public.cierres
  for each row execute function public.auditar('Cierre del día');
create trigger auditar after insert or update or delete on public.pedidos_whatsapp
  for each row execute function public.auditar('WhatsApp');
