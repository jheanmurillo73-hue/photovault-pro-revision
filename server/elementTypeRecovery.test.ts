// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getElementType } from '../client/src/types';
import { supabaseService } from '../client/src/services/supabaseService';

describe('Recuperación de clasificación de elementos', () => {
  it('identifica como cámara un registro histórico que conserva código de cámara', () => {
    expect(getElementType({ cameraCode: 'SB858' })).toBe('camara');
  });

  it('mantiene el tipo persistido aunque el registro tenga datos heredados', () => {
    expect(getElementType({ elementType: 'caja', cameraCode: 'SB850' })).toBe('caja');
  });

  it('prioriza tramos y elementos eléctricos sobre inferencias heredadas', () => {
    expect(getElementType({ tramo: '3x4"', cameraCode: 'SB850' })).toBe('tuberia');
    expect(getElementType({ electricalType: 'transformador', cameraCode: 'SB850' })).toBe('electrico');
  });

  it('incluye la columna y la restauración de cámaras históricas en el script de Supabase', () => {
    const schemaSql = supabaseService.getSupabaseSchemaSql();

    expect(schemaSql).toContain('element_type TEXT');
    expect(schemaSql).toContain("WHEN camera_code IS NOT NULL THEN 'camara'");
    expect(schemaSql).toContain('inspection_photos_element_type_check');
  });
});
