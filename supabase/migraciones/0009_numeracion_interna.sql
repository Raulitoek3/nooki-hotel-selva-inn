-- 0009 · Número correlativo de las series internas (NV01, nota de venta).
-- Solo la usa el servidor (Edge Function "facturar"); el navegador no puede llamarla.
create or replace function public.siguiente_numero_interno(p_serie text)
returns int language sql security definer set search_path = ''
as $$
  update public.series set ultimo_numero = ultimo_numero + 1
   where serie = p_serie and interna
  returning ultimo_numero
$$;
revoke execute on function public.siguiente_numero_interno(text) from public, anon, authenticated;
grant execute on function public.siguiente_numero_interno(text) to service_role;
