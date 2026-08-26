import { beforeAll, describe, expect, it, vi } from 'vitest';

let isSupabaseStorageUrl: (url?: string) => boolean;
let bucket = '';

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  const storageService = await import('../client/src/services/supabaseStorageService');
  isSupabaseStorageUrl = storageService.isSupabaseStorageUrl;
  bucket = storageService.SUPABASE_MEDIA_BUCKET;
});

describe('Supabase Storage media URLs', () => {
  it('reconoce las URLs públicas del bucket de evidencias', () => {
    const url = `https://example.supabase.co/storage/v1/object/public/${bucket}/evidences/elemento-1/01.jpg`;

    expect(isSupabaseStorageUrl(url)).toBe(true);
  });

  it('no confunde imágenes locales o previsualizaciones técnicas con archivos en la nube', () => {
    expect(isSupabaseStorageUrl('data:image/jpeg;base64,archivo-local')).toBe(false);
    expect(isSupabaseStorageUrl('https://example.com/evidence.jpg')).toBe(false);
  });
});
