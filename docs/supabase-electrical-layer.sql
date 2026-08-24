-- PhotoVault Pro — capa de Obras Eléctricas
-- Este script no elimina ni modifica los datos civiles existentes.

ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS plan_layer TEXT NOT NULL DEFAULT 'civil';
ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS electrical_type TEXT;
ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS electrical_color TEXT;

ALTER TABLE public.inspection_photos
  DROP CONSTRAINT IF EXISTS inspection_photos_plan_layer_check;
ALTER TABLE public.inspection_photos
  ADD CONSTRAINT inspection_photos_plan_layer_check
  CHECK (plan_layer IN ('civil', 'electrical'));

ALTER TABLE public.inspection_photos
  DROP CONSTRAINT IF EXISTS inspection_photos_electrical_color_check;
ALTER TABLE public.inspection_photos
  ADD CONSTRAINT inspection_photos_electrical_color_check
  CHECK (electrical_color IS NULL OR electrical_color ~ '^#[0-9A-Fa-f]{6}$');

NOTIFY pgrst, 'reload schema';
