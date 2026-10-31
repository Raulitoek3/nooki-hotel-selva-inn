-- 0007 · Marca del hotel: datos públicos de su web y nombre del administrador sin "Nooki"
-- Fuente: https://www.hotelselvainn.com (dirección, teléfono y correo públicos).

update public.config set
  nombre_comercial = 'Hotel Selva Inn',
  direccion        = 'Jr. 28 de Julio 541, Puerto Maldonado, Madre de Dios',
  telefono         = '+51 946 895 818',
  correo           = 'info@hotelselvainn.com'
where id = 1;

-- El administrador se muestra como "Administrador" dentro del sistema del hotel
update public.usuarios set nombre = 'Administrador'
where correo = 'oficinavirtual@nooki.pe' and nombre = 'Nooki (administrador)';

create or replace function public.alta_admin_nooki()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) = 'oficinavirtual@nooki.pe' then
    insert into public.usuarios (id, nombre, rol, correo)
    values (new.id, 'Administrador', 'admin', lower(new.email))
    on conflict (id) do update set rol = 'admin', activo = true;
  end if;
  return new;
end $$;

revoke execute on function public.alta_admin_nooki() from public, anon, authenticated;
