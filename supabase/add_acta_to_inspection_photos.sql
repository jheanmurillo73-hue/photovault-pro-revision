-- Añade el acta asignada y la preferencia de visibilidad de su rótulo en el plano.
-- Ejecutar una sola vez en Supabase SQL Editor.
ALTER TABLE public.inspection_photos
ADD COLUMN IF NOT EXISTS acta TEXT;

ALTER TABLE public.inspection_photos
ADD COLUMN IF NOT EXISTS show_acta_label BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_inspection_photos_acta
ON public.inspection_photos (acta)
WHERE acta IS NOT NULL;
