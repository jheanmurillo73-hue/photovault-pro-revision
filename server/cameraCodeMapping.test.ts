import { describe, expect, it } from 'vitest';
import { getCameraTypeForCode } from '../client/src/lib/cameraCodeMapping';

describe('Asignación automática de tipo de cámara', () => {
  it('asigna Datos cuando se selecciona SB858', () => {
    expect(getCameraTypeForCode('SB858', 'MT')).toBe('Datos');
  });

  it('conserva el tipo actual para los demás códigos', () => {
    expect(getCameraTypeForCode('SB850', 'BT')).toBe('BT');
  });
});
