-- 0008 · El hotel está exonerado de IGV por la Ley de la Amazonía (Ley 27037).
-- Confirmado por Raúl el 01/11/2026. En Nooki la empresa también debe quedar marcada "Amazonía"
-- para que los ítems salgan exonerados (tip_afe_igv 20) con su leyenda.

update public.config set amazonia = true where id = 1;
