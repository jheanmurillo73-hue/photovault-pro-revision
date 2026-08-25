-- Amplía los calibres válidos de cable para soportar Alumbrado: 12, 10, 8 y 6.
-- La interfaz solo presenta estos cuatro calibres dentro de Obras Eléctricas Alumbrado.

ALTER TABLE public.inspection_photos
DROP CONSTRAINT IF EXISTS inspection_photos_cable_gauge_check;

ALTER TABLE public.inspection_photos
ADD CONSTRAINT inspection_photos_cable_gauge_check
CHECK (cable_gauge IS NULL OR cable_gauge IN ('350', '500', '2/0', '4/0', '12', '10', '8', '6'));

NOTIFY pgrst, 'reload schema';
