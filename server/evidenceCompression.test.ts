import { describe, expect, it } from 'vitest';
import { getDataUrlByteSize, getEvidenceImageCompressionProfile } from '../client/src/services/deviceStorageService';

describe('Compresión adaptativa de evidencias', () => {
  it('aplica perfiles más restrictivos a imágenes pesadas antes de sincronizarlas', () => {
    expect(getEvidenceImageCompressionProfile(2 * 1024 * 1024)).toMatchObject({ level: 'estándar', maxWidth: 1920 });
    expect(getEvidenceImageCompressionProfile(4 * 1024 * 1024)).toMatchObject({ level: 'reforzada', maxWidth: 1600, quality: 0.72 });
    expect(getEvidenceImageCompressionProfile(9 * 1024 * 1024)).toMatchObject({ level: 'intensiva', maxWidth: 1280, quality: 0.66 });
  });

  it('estima correctamente el tamaño de un resultado codificado en data URL', () => {
    expect(getDataUrlByteSize('data:image/jpeg;base64,QUJDRA==')).toBe(4);
  });
});
