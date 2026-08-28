import { describe, expect, it } from 'vitest';
import { getPipeQuantityOptions } from '../client/src/components/TramoSelector';

describe('opciones de cantidad de tubería', () => {
  it('incluye hasta 21 tubos para baja tensión', () => {
    const options = getPipeQuantityOptions(21);

    expect(options).toContain(21);
    expect(Math.max(...options)).toBe(21);
  });

  it('conserva las opciones comunes y permite el límite estándar en otras redes', () => {
    const options = getPipeQuantityOptions(24);

    expect(options).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 18, 20, 21, 24]));
    expect(Math.max(...options)).toBe(24);
  });
});

describe('recuperación de tramos reclasificados', () => {
  it('prioriza una señal de tubería sobre una clasificación remota de cámara', async () => {
    const { getElementType } = await import('../client/src/types');

    expect(getElementType({ elementType: 'camara', cameraCode: 'SB850', tramo: '21x4"' })).toBe('tuberia');
  });
});
