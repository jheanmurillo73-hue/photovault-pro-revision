import { describe, expect, it, vi } from 'vitest';

const list = vi.fn().mockResolvedValue({
  data: [{ name: 'active-plan.jpg', updated_at: '2026-08-26T20:45:00.000Z' }],
  error: null,
});
const getPublicUrl = vi.fn().mockReturnValue({
  data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg' },
});

vi.mock('../client/src/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    storage: {
      from: () => ({ list, getPublicUrl }),
    },
  }),
}));

import { resolveBlueprintImage, restoreBlueprintFromSources } from '../client/src/services/blueprintStorageService';
import { getCloudBlueprintUrl } from '../client/src/services/supabaseStorageService';

describe('Recuperación remota del plano', () => {
  it('obtiene la URL pública del plano almacenado con una versión que invalida copias antiguas', async () => {
    await expect(getCloudBlueprintUrl()).resolves.toBe(
      'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg?v=2026-08-26T20%3A45%3A00.000Z',
    );
    expect(list).toHaveBeenCalledWith('blueprints', { limit: 10, search: 'active-plan.jpg' });
  });

  it('prioriza el plano remoto actualizado sobre una copia local obsoleta del inspector', () => {
    const remoteBlueprint = 'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg?v=nuevo';
    const staleLocalBlueprint = 'data:image/jpeg;base64,copia-obsoleta';

    expect(resolveBlueprintImage(remoteBlueprint, staleLocalBlueprint)).toBe(remoteBlueprint);
  });

  it('restaura en el mapa el plano del administrador aunque el inspector conserve una copia anterior', async () => {
    const loadRemoteBlueprint = vi.fn().mockResolvedValue('https://example.supabase.co/blueprints/active-plan.jpg?v=admin-actualizado');
    const loadStaleInspectorCache = vi.fn().mockResolvedValue('data:image/jpeg;base64,plano-anterior');

    await expect(
      restoreBlueprintFromSources(loadRemoteBlueprint, loadStaleInspectorCache),
    ).resolves.toEqual({
      cloudImage: 'https://example.supabase.co/blueprints/active-plan.jpg?v=admin-actualizado',
      storedImage: 'data:image/jpeg;base64,plano-anterior',
      imageUrl: 'https://example.supabase.co/blueprints/active-plan.jpg?v=admin-actualizado',
    });
    expect(loadRemoteBlueprint).toHaveBeenCalledOnce();
    expect(loadStaleInspectorCache).toHaveBeenCalledOnce();
  });
});
