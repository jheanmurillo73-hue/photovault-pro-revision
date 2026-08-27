import { describe, expect, it } from 'vitest';
import { getCameraSelectionLabel } from '../client/src/lib/cameraSelectionLabel';

describe('Etiqueta de cámara seleccionada', () => {
  it('muestra código y nombre cuando el elemento tiene ambos datos', () => {
    expect(getCameraSelectionLabel('SB858', 'C49_BT')).toBe('SB858 · C49_BT');
  });

  it('evita repetir el código cuando el nombre coincide', () => {
    expect(getCameraSelectionLabel('SB858', 'SB858')).toBe('SB858');
  });
});
