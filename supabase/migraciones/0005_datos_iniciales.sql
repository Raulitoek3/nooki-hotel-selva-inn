-- 0005 · Datos iniciales del hotel (tomados del prototipo; se cambian en Ajustes)
-- No incluye huéspedes, reservas, productos ni personal de ejemplo.

insert into public.config (id) values (1);
insert into public.clave_admin (id) values (1);  -- sin clave: se crea la primera vez desde Ajustes

insert into public.series (serie, tipo, interna) values
  ('B001', 'boleta', false),
  ('F001', 'factura', false),
  ('BC01', 'nota_credito_boleta', false),
  ('FC01', 'nota_credito_factura', false),
  ('NV01', 'nota_venta', true);

insert into public.tipos_habitacion (codigo, nombre, tarifa, camas, capacidad, orden) values
  ('P',  'Personal',          160, 1, 1,  1),
  ('D',  'Doble',             200, 2, 2,  2),
  ('T',  'Triple',            260, 3, 3,  3),
  ('MQ', 'Matrimonial Queen', 180, 1, 2,  4),
  ('MK', 'Matrimonial King',  220, 1, 2,  5),
  ('KD', 'King Decorada',     280, 1, 2,  6),
  ('AU', 'Auditorio',         125, 0, 40, 7);

insert into public.habitaciones (numero, tipo, piso) values
  ('101', 'P', 1), ('102', 'P', 1), ('103', 'P', 1), ('104', 'P', 1),
  ('201', 'MQ', 2), ('202', 'P', 2), ('204', 'D', 2), ('205', 'MK', 2), ('206', 'P', 2),
  ('301', 'MK', 3), ('302', 'P', 3), ('303', 'P', 3), ('304', 'MQ', 3), ('306', 'MQ', 3),
  ('307', 'T', 3), ('308', 'MK', 3), ('309', 'P', 3), ('310', 'MQ', 3), ('311', 'P', 3),
  ('312', 'D', 3), ('313', 'P', 3), ('314', 'D', 3),
  ('401', 'MQ', 4), ('402', 'P', 4), ('403', 'P', 4), ('405', 'KD', 4), ('406', 'MQ', 4),
  ('407', 'T', 4), ('408', 'MK', 4), ('409', 'P', 4), ('410', 'MQ', 4), ('411', 'MQ', 4),
  ('412', 'D', 4), ('413', 'D', 4),
  ('AUD', 'AU', 0);

insert into public.origenes (nombre, comision_pct, orden) values
  ('Directo', 0, 1), ('WhatsApp', 0, 2), ('Booking', 15, 3), ('Airbnb', 15, 4),
  ('Facebook', 0, 5), ('TikTok', 0, 6), ('Amistades', 0, 7), ('Redes sociales', 0, 8);

insert into public.formas_pago (nombre, orden) values
  ('Efectivo', 1), ('Yape', 2), ('Plin', 3), ('Tarjeta débito', 4), ('Tarjeta crédito', 5),
  ('Transferencia BCP', 6), ('Transferencia BBVA', 7), ('Transferencia Interbank', 8),
  ('Scotiabank', 9), ('Página web', 10), ('Cheque', 11);

insert into public.motivos_viaje (nombre, orden) values
  ('Negocios y motivos profesionales', 1), ('Trabajo', 2), ('Vacaciones', 3),
  ('Visita familiar', 4), ('Salud', 5), ('Por horas', 6);

-- Mesas del restaurante: Salón 1–10, Piscina P1–P4, Terraza T1–T6, Recepción R1–R2
insert into public.mesas (id, nombre, ambiente, asientos, orden)
select a.pref_id || i, a.pref_nombre || i, a.ambiente, a.asientos + case when i % 3 = 0 then 2 else 0 end, a.orden * 100 + i
from (values
  ('S', '',  'Salón',     4, 1, 10),
  ('P', 'P', 'Piscina',   4, 2, 4),
  ('T', 'T', 'Terraza',   2, 3, 6),
  ('R', 'R', 'Recepción', 2, 4, 2)
) as a (pref_id, pref_nombre, ambiente, asientos, orden, cantidad)
cross join lateral generate_series(1, a.cantidad) as i;

insert into public.impresoras (id, nombre, uso, activa) values
  ('TICKET',    'Ticketera recepción',   'Comprobantes',      true),
  ('PRECUENTA', 'Ticketera restaurante', 'Precuentas',        true),
  ('COCINA',    'Impresora cocina',      'Comanda de cocina', true),
  ('BARRA',     'Impresora barra',       'Comanda de barra',  false);
