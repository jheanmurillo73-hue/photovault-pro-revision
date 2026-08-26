import { describe, expect, it, vi } from 'vitest';

const list = vi.fn().mockResolvedValue({ data: [{ name: 'active-plan.jpg' }], error: null });
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

import { getCloudBlueprintUrl } from '../client/src/services/supabaseStorageService';

describe('Recuperación remota del plano', () => {
  it('obtiene la URL pública del plano almacenado cuando no existe una copia local', async () => {
    await expect(getCloudBlueprintUrl()).resolves.toBe(
      'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg',
    );
    expect(list).toHaveBeenCalledWith('blueprints', { limit: 10, search: 'active-plan.jpg' });
  });
});
