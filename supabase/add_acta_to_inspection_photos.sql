-- Añade el acta asignada a cada caja, cámara o tubería.
-- Ejecutar una sola vez en Supabase SQL Editor.
ALTER TABLE public.inspection_photos
ADD COLUMN IF NOT EXISTS acta TEXT;

CREATE INDEX IF NOT EXISTS idx_inspection_photos_acta
ON public.inspection_photos (acta)
WHERE acta IS NOT NULL;
