-- 0001 · Base: extensiones, usuarios, clave de administrador y auditoría
-- Nooki Hotel · Hotel Selva Inn

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------
-- Usuarios del sistema
-- Solo dos clases de cuenta: la PC de recepción (rol 'recepcion')
-- y el dueño desde su celular (rol 'dueno', solo lectura).
-- El personal (camareras, mozos) NO entra al sistema: va en "personal".
-- ---------------------------------------------------------------
create table public.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  rol        text not null check (rol in ('recepcion', 'dueno')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
comment on table public.usuarios is 'Cuentas que entran al sistema: PC de recepción (recepcion) y dueño (dueno, solo lectura).';

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = ''
as $$ select u.rol from public.usuarios u where u.id = auth.uid() and u.activo $$;

create or replace function public.es_usuario_hotel()
returns boolean language sql stable set search_path = ''
as $$ select public.mi_rol() is not null $$;

create or replace function public.puede_operar()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.mi_rol() = 'recepcion', false) $$;

-- ---------------------------------------------------------------
-- Clave de administrador (guardada con hash bcrypt, nunca en texto)
-- Nadie la puede leer: sin políticas RLS. Solo se usa por funciones.
-- ---------------------------------------------------------------
create table public.clave_admin (
  id            smallint primary key default 1 check (id = 1),
  hash          text,
  fallos        int not null default 0,
  espera_hasta  timestamptz,
  cambiada_en   timestamptz
);
comment on table public.clave_admin is 'Hash de la clave de administrador e intentos fallidos. Privada.';

create table public.sesiones_admin (
  usuario_id  uuid primary key references auth.users (id) on delete cascade,
  hasta       timestamptz not null
);
comment on table public.sesiones_admin is 'Hasta cuándo está abierta la clave de administrador en cada cuenta (10 minutos, renovable).';

alter table public.clave_admin enable row level security;
alter table public.sesiones_admin enable row level security;
revoke all on public.clave_admin, public.sesiones_admin from anon, authenticated;

create or replace function public.admin_abierto()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sesiones_admin s
    where s.usuario_id = auth.uid() and s.hasta > now()
  )
$$;

-- ---------------------------------------------------------------
-- Auditoría: solo agregar. No se edita ni se borra (ni con la llave del servidor).
-- ---------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  creado_en    timestamptz not null default now(),
  usuario_id   uuid default auth.uid(),
  modulo       text not null,
  tipo         text not null default 'cambio' check (tipo in ('cambio', 'con_clave', 'alerta', 'sunat', 'sistema')),
  con_clave    boolean not null default false,
  accion       text not null,
  detalle      text,
  tabla        text,
  registro_id  text,
  antes        jsonb,
  despues      jsonb
);
comment on table public.auditoria is 'Todo lo que pasa en el sistema, con fecha y hora. Solo agregar.';
create index auditoria_fecha on public.auditoria (creado_en desc);
create index auditoria_modulo on public.auditoria (modulo, creado_en desc);
create index auditoria_registro on public.auditoria (tabla, registro_id);

create or replace function public.auditoria_bloquear()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'La auditoría no se puede editar ni borrar.' using errcode = '42501';
end $$;

create trigger auditoria_solo_agregar
  before update or delete on public.auditoria
  for each row execute function public.auditoria_bloquear();
create trigger auditoria_sin_vaciar
  before truncate on public.auditoria
  for each statement execute function public.auditoria_bloquear();

-- Disparador genérico: guarda qué cambió en cada tabla.
-- Argumentos: (módulo, columna del id; por defecto 'id').
-- En una modificación guarda solo los campos que cambiaron.
create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_accion  text;
  v_id      text;
  v_tipo    text := 'cambio';
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new);
    v_accion  := 'creó';
  elsif tg_op = 'DELETE' then
    v_antes  := to_jsonb(old);
    v_accion := 'eliminó';
  else
    select jsonb_object_agg(n.key, n.value) into v_despues
      from jsonb_each(to_jsonb(new)) n
     where (to_jsonb(old) -> n.key) is distinct from n.value
       and n.key <> 'actualizado_en';
    if v_despues is null then
      return new;
    end if;
    select jsonb_object_agg(o.key, o.value) into v_antes
      from jsonb_each(to_jsonb(old)) o
     where v_despues ? o.key;
    v_accion := 'modificó';
  end if;

  v_id := coalesce(to_jsonb(new), to_jsonb(old)) ->> coalesce(tg_argv[1], 'id');

  if auth.uid() is null and tg_table_name in ('comprobantes', 'avisos_nooki') then
    v_tipo := 'sunat';
  end if;

  insert into public.auditoria (modulo, tipo, con_clave, accion, tabla, registro_id, antes, despues, usuario_id)
  values (tg_argv[0], v_tipo, public.admin_abierto(), v_accion, tg_table_name, v_id, v_antes, v_despues, auth.uid());

  return coalesce(new, old);
end $$;

-- Pone la hora en "actualizado_en" en cada cambio
create or replace function public.poner_actualizado_en()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------
-- Funciones de la clave de administrador (verificación en el servidor)
-- ---------------------------------------------------------------

-- Verifica la clave. Abre 10 minutos. 5 fallos = espera de 1 minuto.
create or replace function public.verificar_clave(p_clave text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  c        public.clave_admin;
  v_hasta  timestamptz;
  v_fallos int;
begin
  if not public.puede_operar() then
    return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  end if;

  select * into c from public.clave_admin where id = 1 for update;
  if c.hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_clave');
  end if;

  if c.espera_hasta is not null and c.espera_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'espera', 'espera_hasta', c.espera_hasta);
  end if;

  if extensions.crypt(coalesce(p_clave, ''), c.hash) = c.hash then
    v_hasta := now() + interval '10 minutes';
    update public.clave_admin set fallos = 0, espera_hasta = null where id = 1;
    insert into public.sesiones_admin (usuario_id, hasta) values (auth.uid(), v_hasta)
      on conflict (usuario_id) do update set hasta = excluded.hasta;
    insert into public.auditoria (modulo, tipo, con_clave, accion, detalle)
      values ('Clave', 'con_clave', true, 'abrió', 'Clave de administrador correcta');
    return jsonb_build_object('ok', true, 'hasta', v_hasta);
  end if;

  v_fallos := c.fallos + 1;
  if v_fallos >= 5 then
    update public.clave_admin set fallos = 0, espera_hasta = now() + interval '1 minute' where id = 1;
    insert into public.auditoria (modulo, tipo, accion, detalle)
      values ('Clave', 'alerta', 'bloqueó', '5 intentos fallidos de la clave de administrador: espera de 1 minuto');
    return jsonb_build_object('ok', false, 'motivo', 'espera', 'espera_hasta', now() + interval '1 minute');
  end if;

  update public.clave_admin set fallos = v_fallos where id = 1;
  insert into public.auditoria (modulo, tipo, accion, detalle)
    values ('Clave', 'alerta', 'falló', 'Clave de administrador incorrecta (intento ' || v_fallos || ' de 5)');
  return jsonb_build_object('ok', false, 'motivo', 'incorrecta', 'intentos_restantes', 5 - v_fallos);
end $$;

-- Renueva 10 minutos más si la clave sigue abierta
create or replace function public.renovar_clave()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_hasta timestamptz;
begin
  update public.sesiones_admin set hasta = now() + interval '10 minutes'
   where usuario_id = auth.uid() and hasta > now()
  returning hasta into v_hasta;
  return jsonb_build_object('ok', v_hasta is not null, 'hasta', v_hasta);
end $$;

-- Botón "Bloquear"
create or replace function public.bloquear_clave()
returns void language sql security definer set search_path = ''
as $$ delete from public.sesiones_admin where usuario_id = auth.uid() $$;

-- Cambiar la clave. La primera vez (sin clave guardada) solo pide la nueva.
create or replace function public.cambiar_clave(p_actual text, p_nueva text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.clave_admin;
begin
  if not public.puede_operar() then
    return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  end if;
  if p_nueva is null or length(p_nueva) < 4 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_corta');
  end if;

  select * into c from public.clave_admin where id = 1 for update;
  if c.hash is not null then
    if not public.admin_abierto() then
      return jsonb_build_object('ok', false, 'motivo', 'clave_cerrada');
    end if;
    if extensions.crypt(coalesce(p_actual, ''), c.hash) <> c.hash then
      return jsonb_build_object('ok', false, 'motivo', 'actual_incorrecta');
    end if;
  end if;

  insert into public.clave_admin (id, hash, fallos, espera_hasta, cambiada_en)
  values (1, extensions.crypt(p_nueva, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (id) do update set hash = excluded.hash, fallos = 0, espera_hasta = null, cambiada_en = now();

  insert into public.auditoria (modulo, tipo, con_clave, accion, detalle)
    values ('Clave', 'con_clave', true, 'cambió', 'Se cambió la clave de administrador');
  return jsonb_build_object('ok', true);
end $$;

-- ¿Ya hay clave guardada? (para mostrar "crear clave" la primera vez)
create or replace function public.hay_clave()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.clave_admin where id = 1 and hash is not null) $$;
