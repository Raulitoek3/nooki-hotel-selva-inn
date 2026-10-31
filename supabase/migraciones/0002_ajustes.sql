-- 0002 · Ajustes del hotel (todo lo que en la pantalla Ajustes pide clave)

-- Configuración general: una sola fila (id = 1)
create table public.config (
  id                    smallint primary key default 1 check (id = 1),
  nombre_comercial      text not null default 'Selva Inn',
  razon_social          text,
  ruc                   text check (ruc is null or ruc ~ '^\d{11}$'),
  direccion             text,
  telefono              text,
  correo                text,
  zona_horaria          text not null default 'America/Lima',
  -- Facturación
  ambiente_nooki        text not null default 'beta' check (ambiente_nooki in ('beta', 'produccion')),
  igv_pct               numeric(5,2) not null default 10.5,
  amazonia              boolean not null default false,
  adelanto_comprobante  text not null default 'al_cobrar' check (adelanto_comprobante in ('al_cobrar', 'checkout')),
  impresion_automatica  boolean not null default true,
  -- Horarios
  hora_checkin          time not null default '09:00',
  hora_checkout         time not null default '11:00',
  hora_max_checkout     time not null default '11:30',
  retoque_min           int not null default 30,
  early_desde           time not null default '06:00',
  early_pct             numeric(5,2) not null default 50,
  late_hasta            time not null default '14:00',
  late_pct              numeric(5,2) not null default 50,
  aviso_min             int not null default 15,
  -- Tarifa de fin de semana
  fin_semana_activo     boolean not null default false,
  fin_semana_pct        numeric(5,2) not null default 10,
  actualizado_en        timestamptz not null default now()
);
comment on table public.config is 'Datos del hotel, facturación y horarios. Una sola fila.';

-- Series de comprobantes (se crean también en Nooki, salvo la interna NV01)
create table public.series (
  serie          text primary key,
  tipo           text not null check (tipo in ('boleta', 'factura', 'nota_credito_boleta', 'nota_credito_factura', 'nota_venta')),
  interna        boolean not null default false,
  ultimo_numero  int not null default 0,
  activa         boolean not null default true
);
comment on table public.series is 'Series de comprobantes. ultimo_numero solo se usa en las internas (NV01); las de SUNAT las numera Nooki.';

create table public.tipos_habitacion (
  codigo          text primary key,
  nombre          text not null unique,
  tarifa          numeric(10,2) not null check (tarifa >= 0),
  camas           int not null default 1 check (camas >= 0),
  capacidad       int not null default 1 check (capacidad > 0),
  orden           int not null default 0,
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

create table public.habitaciones (
  numero          text primary key,
  tipo            text not null references public.tipos_habitacion (codigo) on update cascade,
  piso            int not null default 1,
  fuera_de_venta  boolean not null default false,
  zk_habitacion   text,
  notas           text,
  actualizado_en  timestamptz not null default now()
);
comment on column public.habitaciones.zk_habitacion is 'Habitación equivalente en ZKBiolock (cerraduras). Pendiente.';
create index habitaciones_tipo on public.habitaciones (tipo);

create table public.temporadas (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  desde       date not null,
  hasta       date not null,
  porcentaje  numeric(6,2) not null check (porcentaje between -100 and 300),
  constraint temporadas_fechas check (hasta >= desde)
);
comment on column public.temporadas.porcentaje is 'Sube (+) o baja (-) la tarifa en ese porcentaje.';

create table public.origenes (
  nombre        text primary key,
  comision_pct  numeric(5,2) not null default 0,
  activo        boolean not null default true,
  orden         int not null default 0
);

create table public.formas_pago (
  nombre  text primary key,
  activa  boolean not null default true,
  orden   int not null default 0
);

create table public.motivos_viaje (
  nombre  text primary key,
  orden   int not null default 0
);

create table public.motivos_caja (
  id      bigint generated always as identity primary key,
  nombre  text not null,
  tipo    text not null check (tipo in ('ingreso', 'salida')),
  activo  boolean not null default true,
  unique (nombre, tipo)
);

-- Personal: solo una lista para asignar tareas. No entran al sistema.
create table public.personal (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  cargo      text not null,
  turno      text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table public.mesas (
  id        text primary key,
  nombre    text not null,
  ambiente  text not null,
  asientos  int not null default 4,
  orden     int not null default 0,
  activa    boolean not null default true
);

create table public.impresoras (
  id      text primary key,
  nombre  text not null,
  uso     text not null,
  ip      text,
  activa  boolean not null default true
);

create trigger config_actualizado before update on public.config
  for each row execute function public.poner_actualizado_en();
create trigger tipos_actualizado before update on public.tipos_habitacion
  for each row execute function public.poner_actualizado_en();
create trigger habitaciones_actualizado before update on public.habitaciones
  for each row execute function public.poner_actualizado_en();
