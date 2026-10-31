-- 0006 · Rol administrador (Nooki) y gestión de usuarios desde el portal
--
-- admin     = cuenta de Nooki (oficinavirtual@nooki.pe). Todas las funciones:
--             opera como recepción, Ajustes sin pedir clave, puede reiniciar la
--             clave de administrador y crear/editar usuarios (Edge Function "usuarios").
-- recepcion = PC de recepción. Opera; lo delicado pide la clave.
-- dueno     = dueño del hotel. Solo lectura.

alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check check (rol in ('admin', 'recepcion', 'dueno'));
alter table public.usuarios add column correo text;
comment on table public.usuarios is 'Cuentas que entran al sistema: admin (Nooki), recepcion (PC de recepción), dueno (solo lectura).';

create or replace function public.puede_operar()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.mi_rol() in ('admin', 'recepcion'), false) $$;

create or replace function public.es_admin()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.mi_rol() = 'admin', false) $$;

-- El administrador siempre cuenta como "clave abierta"
create or replace function public.admin_abierto()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(public.mi_rol() = 'admin', false)
      or exists (
        select 1 from public.sesiones_admin s
        where s.usuario_id = auth.uid() and s.hasta > now()
      )
$$;

-- El administrador puede poner una clave nueva sin saber la anterior (si se olvidó)
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
  if c.hash is not null and not public.es_admin() then
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

-- La cuenta de Nooki queda como administrador apenas se crea en Authentication
create or replace function public.alta_admin_nooki()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) = 'oficinavirtual@nooki.pe' then
    insert into public.usuarios (id, nombre, rol, correo)
    values (new.id, 'Nooki (administrador)', 'admin', lower(new.email))
    on conflict (id) do update set rol = 'admin', activo = true;
  end if;
  return new;
end $$;

create trigger alta_admin_nooki after insert on auth.users
  for each row execute function public.alta_admin_nooki();

-- Por si la cuenta ya existía
insert into public.usuarios (id, nombre, rol, correo)
select u.id, 'Nooki (administrador)', 'admin', lower(u.email)
  from auth.users u where lower(u.email) = 'oficinavirtual@nooki.pe'
on conflict (id) do update set rol = 'admin', activo = true;

revoke execute on function public.alta_admin_nooki() from public, anon, authenticated;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;
