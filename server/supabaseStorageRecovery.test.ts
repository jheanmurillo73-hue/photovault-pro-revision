import { describe, expect, it, vi } from 'vitest';

const list = vi.fn().mockResolvedValue({
  data: [{
    name: 'active-plan.jpg',
    id: 'blueprint-object',
    updated_at: '2026-08-26T20:45:00.000Z',
    created_at: '2026-08-26T20:00:00.000Z',
    metadata: { updatedByName: 'Ing. Laura Gómez', eTag: 'plan-v2' },
  }],
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
import { getBlueprintSyncPresentation } from '../client/src/services/blueprintSyncPresentation';
import { createBlueprintMetadata, getCloudBlueprintRevision, getCloudBlueprintUrl } from '../client/src/services/supabaseStorageService';

describe('Recuperación remota del plano', () => {
  it('obtiene la URL pública del plano almacenado con una versión que invalida copias antiguas', async () => {
    await expect(getCloudBlueprintUrl()).resolves.toBe(
      'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg?v=2026-08-26T20%3A45%3A00.000Z',
    );
    expect(list).toHaveBeenCalledWith('blueprints', { limit: 10, search: 'active-plan.jpg' });
  });

  it('expone la fecha y el autor remoto de la última modificación del plano', async () => {
    await expect(getCloudBlueprintRevision()).resolves.toMatchObject({
      updatedAt: '2026-08-26T20:45:00.000Z',
      updatedByName: 'Ing. Laura Gómez',
      version: '2026-08-26T20:45:00.000Z',
    });
  });

  it('prepara los metadatos de autor al cargar un plano como administrador', () => {
    const metadata = createBlueprintMetadata({ id: 'admin-01', name: 'Ing. Laura Gómez' });

    expect(metadata).toMatchObject({ updatedById: 'admin-01', updatedByName: 'Ing. Laura Gómez' });
    expect(metadata.updatedAt).toEqual(expect.any(String));
  });

  it('prepara para el inspector la carga, el aviso y el registro de una actualización remota', () => {
    const presentation = getBlueprintSyncPresentation({
      isLoading: true,
      isAdmin: false,
      previousVersion: 'plan-viejo',
      revision: {
        url: 'https://example.supabase.co/blueprints/active-plan.jpg?v=plan-nuevo',
        version: 'plan-nuevo',
        updatedAt: '2026-08-26T20:45:00.000Z',
        updatedByName: 'Ing. Laura Gómez',
      },
    });

    expect(presentation).toMatchObject({
      isLoading: true,
      updateNotice: 'Plano actualizado por Ing. Laura Gómez. Se descargó la versión más reciente.',
      authorLabel: 'Ing. Laura Gómez',
    });
    expect(presentation.lastModifiedLabel).not.toBe('Fecha no disponible');
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
