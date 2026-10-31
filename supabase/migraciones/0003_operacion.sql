-- 0003 · Operación diaria: clientes, reservas, restaurante, caja, comprobantes, limpieza

-- ---------------------------------------------------------------
-- Clientes (personas y empresas). Datos personales: protegidos con RLS.
-- tipo_doc con códigos SUNAT: 1 DNI, 4 carné de extranjería, 7 pasaporte, 6 RUC, 0 sin documento
-- ---------------------------------------------------------------
create table public.clientes (
  id                bigint generated always as identity primary key,
  tipo_doc          text not null default '1' check (tipo_doc in ('0', '1', '4', '6', '7')),
  num_doc           text,
  nombre            text not null,
  nacionalidad      text not null default 'Perú',
  telefono          text,
  correo            text,
  direccion         text,
  fecha_nacimiento  date,
  no_grato          boolean not null default false,
  motivo_no_grato   text,
  notas             text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint clientes_doc_unico unique (tipo_doc, num_doc),
  constraint clientes_dni check (tipo_doc <> '1' or num_doc ~ '^\d{8}$'),
  constraint clientes_ruc check (tipo_doc <> '6' or num_doc ~ '^(10|15|16|17|20)\d{9}$')
);
create index clientes_nombre on public.clientes using gin (to_tsvector('simple', nombre));

-- ---------------------------------------------------------------
-- Productos y almacén
-- ---------------------------------------------------------------
create table public.productos (
  id              bigint generated always as identity primary key,
  nombre          text not null unique,
  categoria       text not null,
  tipo            text not null check (tipo in ('Producto', 'Servicio', 'Kit')),
  precio          numeric(10,2) not null check (precio >= 0),
  precios         jsonb not null default '{}'::jsonb,
  costo           numeric(10,2),
  stock           numeric(10,2),
  stock_minimo    numeric(10,2),
  lote            text,
  vence           date,
  en_restaurante  boolean not null default false,
  destino         text check (destino in ('Cocina', 'Barra')),
  unidad          text not null default 'NIU' check (unidad in ('NIU', 'ZZ')),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint productos_stock check (tipo = 'Producto' or stock is null),
  constraint productos_stock_positivo check (stock is null or stock >= 0)
);
comment on column public.productos.precios is 'Precios por lista: {"publico": .., "booking": .., "personal": .., "promo": ..}';
comment on column public.productos.unidad is 'Unidad SUNAT: ZZ servicios, NIU productos.';

create table public.movimientos_stock (
  id           bigint generated always as identity primary key,
  producto_id  bigint not null references public.productos (id),
  tipo         text not null check (tipo in ('entrada', 'salida')),
  cantidad     numeric(10,2) not null check (cantidad > 0),
  referencia   text,
  proveedor    text,
  costo        numeric(10,2),
  lote         text,
  vence        date,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);
create index movimientos_stock_producto on public.movimientos_stock (producto_id, creado_en desc);

-- Cada movimiento cambia el stock del producto
create or replace function public.aplicar_movimiento_stock()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare p public.productos;
begin
  select * into p from public.productos where id = new.producto_id for update;
  if p.tipo <> 'Producto' then
    raise exception 'Solo los productos con stock tienen entradas y salidas.';
  end if;
  if new.tipo = 'salida' and coalesce(p.stock, 0) < new.cantidad then
    raise exception 'Solo hay % en almacén de %.', coalesce(p.stock, 0), p.nombre;
  end if;
  update public.productos set
    stock = coalesce(stock, 0) + case when new.tipo = 'entrada' then new.cantidad else -new.cantidad end,
    costo = case when new.tipo = 'entrada' and new.costo is not null then new.costo else costo end,
    lote  = case when new.tipo = 'entrada' and new.lote  is not null then new.lote  else lote  end,
    vence = case when new.tipo = 'entrada' and new.vence is not null then new.vence else vence end
  where id = new.producto_id;
  return new;
end $$;

create trigger movimientos_stock_aplicar after insert on public.movimientos_stock
  for each row execute function public.aplicar_movimiento_stock();

-- ---------------------------------------------------------------
-- Reservas
-- estado: reservado → confirmado → ocupado (check-in) → finalizada (check-out)
--         o anulada / no_show
-- ---------------------------------------------------------------
create table public.reservas (
  id                 bigint generated always as identity primary key,
  grupo_id           bigint,
  habitacion         text not null references public.habitaciones (numero) on update cascade,
  cliente_id         bigint references public.clientes (id),
  empresa_id         bigint references public.clientes (id),
  origen             text references public.origenes (nombre) on update cascade,
  codigo_externo     text,
  motivo             text,
  referencia         text,
  entrada            date not null,
  salida             date not null,
  tarifa             numeric(10,2) not null check (tarifa >= 0),
  tarifa_nombre      text not null default 'Regular',
  personas           int not null default 1 check (personas > 0),
  estado             text not null default 'reservado'
                     check (estado in ('reservado', 'confirmado', 'ocupado', 'finalizada', 'anulada', 'no_show')),
  checkin_en         timestamptz,
  checkout_en        timestamptz,
  motivo_anulacion   text,
  notas              text,
  creado_en          timestamptz not null default now(),
  creado_por         uuid default auth.uid(),
  actualizado_en     timestamptz not null default now(),
  constraint reservas_fechas check (salida > entrada),
  -- Una habitación no puede tener dos reservas que se crucen
  constraint reservas_sin_cruce exclude using gist (
    habitacion with =,
    daterange(entrada, salida) with &&
  ) where (estado not in ('anulada', 'no_show'))
);
comment on column public.reservas.tarifa is 'Precio por noche acordado.';
create index reservas_fechas_idx on public.reservas (entrada, salida);
create index reservas_cliente on public.reservas (cliente_id);
create index reservas_empresa on public.reservas (empresa_id);
create index reservas_estado on public.reservas (estado);
create index reservas_grupo on public.reservas (grupo_id);

-- Cambiar el precio o anular una reserva pide la clave de administrador
create or replace function public.reservas_pide_clave()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;  -- funciones del servidor
  end if;
  if new.tarifa is distinct from old.tarifa and not public.admin_abierto() then
    raise exception 'Cambiar el precio de una reserva pide la clave de administrador.' using errcode = '42501';
  end if;
  if new.estado = 'anulada' and old.estado <> 'anulada' and not public.admin_abierto() then
    raise exception 'Anular una reserva pide la clave de administrador.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger reservas_clave before update on public.reservas
  for each row execute function public.reservas_pide_clave();

create table public.reserva_huespedes (
  id          bigint generated always as identity primary key,
  reserva_id  bigint not null references public.reservas (id) on delete cascade,
  cliente_id  bigint not null references public.clientes (id),
  principal   boolean not null default false,
  unique (reserva_id, cliente_id)
);
create index reserva_huespedes_cliente on public.reserva_huespedes (cliente_id);

-- ---------------------------------------------------------------
-- Restaurante
-- ---------------------------------------------------------------
create table public.pedidos (
  id              bigint generated always as identity primary key,
  mesa_id         text references public.mesas (id) on update cascade,
  reserva_id      bigint references public.reservas (id),
  mozo            text,
  estado          text not null default 'abierta'
                  check (estado in ('abierta', 'precuenta', 'cobrada', 'cargada', 'anulada')),
  abierto_en      timestamptz not null default now(),
  cerrado_en      timestamptz,
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now()
);
comment on column public.pedidos.estado is 'cargada = se cargó a la cuenta de la habitación (reserva_id).';
create unique index pedidos_un_abierto_por_mesa on public.pedidos (mesa_id) where estado in ('abierta', 'precuenta');
create index pedidos_reserva on public.pedidos (reserva_id);

create table public.pedido_items (
  id           bigint generated always as identity primary key,
  pedido_id    bigint not null references public.pedidos (id) on delete cascade,
  producto_id  bigint references public.productos (id),
  descripcion  text not null,
  precio       numeric(10,2) not null check (precio >= 0),
  cantidad     numeric(10,2) not null check (cantidad > 0),
  enviados     numeric(10,2) not null default 0,
  destino      text check (destino in ('Cocina', 'Barra')),
  creado_en    timestamptz not null default now()
);
comment on column public.pedido_items.enviados is 'Cuántos ya salieron en la comanda.';
create index pedido_items_pedido on public.pedido_items (pedido_id);
create index pedido_items_producto on public.pedido_items (producto_id);

-- ---------------------------------------------------------------
-- Consumos cargados a una reserva (frigobar, lavandería, restaurante…)
-- ---------------------------------------------------------------
create table public.consumos (
  id           bigint generated always as identity primary key,
  reserva_id   bigint not null references public.reservas (id),
  producto_id  bigint references public.productos (id),
  pedido_id    bigint references public.pedidos (id),
  descripcion  text not null,
  unidad       text not null default 'NIU' check (unidad in ('NIU', 'ZZ')),
  cantidad     numeric(10,2) not null check (cantidad > 0),
  precio       numeric(10,2) not null check (precio >= 0),
  anulado      boolean not null default false,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);
create index consumos_reserva on public.consumos (reserva_id);
create index consumos_producto on public.consumos (producto_id);
create index consumos_pedido on public.consumos (pedido_id);

-- ---------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------
create table public.caja_turnos (
  id             bigint generated always as identity primary key,
  responsable    text not null,
  abierto_en     timestamptz not null default now(),
  cerrado_en     timestamptz,
  monto_inicial  numeric(12,2) not null default 0,
  contado        numeric(12,2),
  notas          text,
  creado_por     uuid default auth.uid()
);
comment on column public.caja_turnos.contado is 'Lo que se contó al cerrar (arqueo).';
-- Solo una caja abierta a la vez
create unique index caja_un_turno_abierto on public.caja_turnos ((true)) where cerrado_en is null;

-- ---------------------------------------------------------------
-- Comprobantes. Los escribe SOLO el servidor (Edge Function "facturar"
-- y el aviso de Nooki). Desde el navegador solo se leen.
-- ---------------------------------------------------------------
create table public.comprobantes (
  id                  bigint generated always as identity primary key,
  tipo                text not null check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito', 'nota_venta')),
  serie               text not null references public.series (serie),
  numero              int,
  numero_completo     text generated always as (serie || '-' || numero::text) stored,
  cliente_tipo_doc    text,
  cliente_num_doc     text,
  cliente_nombre      text,
  cliente_direccion   text,
  items               jsonb not null default '[]'::jsonb,
  total               numeric(12,2) not null default 0,
  forma_pago          text not null default 'Contado',
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'enviando', 'aceptado', 'observado', 'rechazado',
                                        'error', 'por_verificar', 'anulado', 'sin_internet', 'interno')),
  codigo_sunat        text,
  mensaje_sunat       text,
  nooki_id            text unique,
  idempotency_key     text unique,
  enlace_pdf          text,
  hash                text,
  afectado_id         bigint references public.comprobantes (id),
  motivo_nota         text,
  descripcion_motivo  text,
  reserva_id          bigint references public.reservas (id),
  pedido_id           bigint references public.pedidos (id),
  emitido_en          timestamptz not null default now(),
  creado_por          uuid default auth.uid(),
  actualizado_en      timestamptz not null default now(),
  unique (serie, numero)
);
create index comprobantes_fecha on public.comprobantes (emitido_en desc);
create index comprobantes_estado on public.comprobantes (estado);
create index comprobantes_reserva on public.comprobantes (reserva_id);
create index comprobantes_pedido on public.comprobantes (pedido_id);
create index comprobantes_afectado on public.comprobantes (afectado_id);

-- ---------------------------------------------------------------
-- Pagos (de reservas o del restaurante)
-- ---------------------------------------------------------------
create table public.pagos (
  id                bigint generated always as identity primary key,
  reserva_id        bigint references public.reservas (id),
  pedido_id         bigint references public.pedidos (id),
  turno_id          bigint references public.caja_turnos (id),
  forma_pago        text not null references public.formas_pago (nombre) on update cascade,
  monto             numeric(12,2) not null check (monto > 0),
  tipo              text not null default 'pago' check (tipo in ('adelanto', 'pago', 'restaurante')),
  comprobante_id    bigint references public.comprobantes (id),
  anulado           boolean not null default false,
  motivo_anulacion  text,
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  constraint pagos_de_algo check (reserva_id is not null or pedido_id is not null)
);
create index pagos_reserva on public.pagos (reserva_id);
create index pagos_pedido on public.pagos (pedido_id);
create index pagos_turno on public.pagos (turno_id);
create index pagos_comprobante on public.pagos (comprobante_id);
create index pagos_fecha on public.pagos (creado_en desc);

create table public.caja_movimientos (
  id           bigint generated always as identity primary key,
  turno_id     bigint not null references public.caja_turnos (id),
  tipo         text not null check (tipo in ('ingreso', 'salida')),
  motivo       text not null,
  forma_pago   text references public.formas_pago (nombre) on update cascade,
  monto        numeric(12,2) not null check (monto > 0),
  pago_id      bigint references public.pagos (id),
  descripcion  text,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);
create index caja_movimientos_turno on public.caja_movimientos (turno_id);
create index caja_movimientos_pago on public.caja_movimientos (pago_id);

-- ---------------------------------------------------------------
-- Limpieza: por limpiar → limpiando → por revisar → lista
-- ---------------------------------------------------------------
create table public.limpieza (
  id              bigint generated always as identity primary key,
  habitacion      text not null references public.habitaciones (numero) on update cascade,
  tipo            text not null default 'Salida' check (tipo in ('Salida', 'Repaso', 'Retoque')),
  estado          text not null default 'sucia' check (estado in ('sucia', 'limpiando', 'revisar', 'lista')),
  personal_id     bigint references public.personal (id),
  desde           timestamptz not null default now(),
  terminado_en    timestamptz,
  notas           text,
  actualizado_en  timestamptz not null default now()
);
create unique index limpieza_una_abierta on public.limpieza (habitacion) where estado <> 'lista';
create index limpieza_personal on public.limpieza (personal_id);
create index limpieza_fecha on public.limpieza (desde desc);

-- ---------------------------------------------------------------
-- Cierre del día
-- ---------------------------------------------------------------
create table public.cierres (
  id             bigint generated always as identity primary key,
  fecha          date not null unique,
  responsable    text not null,
  cerrado_en     timestamptz not null default now(),
  ingresos       numeric(12,2) not null default 0,
  ocupacion_pct  numeric(5,2) not null default 0,
  llegadas       int not null default 0,
  salidas        int not null default 0,
  resumen        jsonb not null default '{}'::jsonb,
  creado_por     uuid default auth.uid()
);

-- ---------------------------------------------------------------
-- Pedidos de reserva por WhatsApp
-- ---------------------------------------------------------------
create table public.pedidos_whatsapp (
  id               bigint generated always as identity primary key,
  telefono         text not null,
  nombre           text,
  tipo_doc         text check (tipo_doc in ('0', '1', '4', '6', '7')),
  num_doc          text,
  entrada          date,
  salida           date,
  tipo_habitacion  text references public.tipos_habitacion (codigo) on update cascade,
  personas         int,
  adelanto         numeric(12,2) not null default 0,
  forma_pago       text,
  estado           text not null default 'en_curso'
                   check (estado in ('en_curso', 'creado', 'confirmado', 'rechazado', 'timeout')),
  mensaje          text,
  conversacion     jsonb not null default '[]'::jsonb,
  motivo_rechazo   text,
  habitacion       text references public.habitaciones (numero) on update cascade,
  reserva_id       bigint references public.reservas (id),
  comprobante_id   bigint references public.comprobantes (id),
  creado_en        timestamptz not null default now(),
  vence_en         timestamptz not null default now() + interval '24 hours',
  actualizado_en   timestamptz not null default now()
);
create index pedidos_whatsapp_estado on public.pedidos_whatsapp (estado, creado_en desc);
create index pedidos_whatsapp_tipo on public.pedidos_whatsapp (tipo_habitacion);
create index pedidos_whatsapp_habitacion on public.pedidos_whatsapp (habitacion);
create index pedidos_whatsapp_reserva on public.pedidos_whatsapp (reserva_id);
create index pedidos_whatsapp_comprobante on public.pedidos_whatsapp (comprobante_id);

-- ---------------------------------------------------------------
-- Avisos (webhooks) recibidos de Nooki. Para no procesar dos veces el mismo.
-- Solo los escribe la Edge Function "nooki-aviso".
-- ---------------------------------------------------------------
create table public.avisos_nooki (
  entrega_id   text primary key,
  evento       text not null,
  recibido_en  timestamptz not null default now(),
  cuerpo       jsonb not null,
  procesado    boolean not null default false
);

-- Índices de llaves foráneas que faltan
create index reservas_habitacion on public.reservas (habitacion);
create index reservas_origen on public.reservas (origen);
create index pagos_forma on public.pagos (forma_pago);
create index caja_movimientos_forma on public.caja_movimientos (forma_pago);
create index pedidos_mesa on public.pedidos (mesa_id);
create index comprobantes_serie on public.comprobantes (serie);

-- "actualizado_en" automático
create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.poner_actualizado_en();
create trigger productos_actualizado before update on public.productos
  for each row execute function public.poner_actualizado_en();
create trigger reservas_actualizado before update on public.reservas
  for each row execute function public.poner_actualizado_en();
create trigger pedidos_actualizado before update on public.pedidos
  for each row execute function public.poner_actualizado_en();
create trigger comprobantes_actualizado before update on public.comprobantes
  for each row execute function public.poner_actualizado_en();
create trigger limpieza_actualizado before update on public.limpieza
  for each row execute function public.poner_actualizado_en();
create trigger pedidos_whatsapp_actualizado before update on public.pedidos_whatsapp
  for each row execute function public.poner_actualizado_en();
