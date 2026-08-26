// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapView } from '../client/src/components/MapView';
import type { BlueprintRevision } from '../client/src/services/supabaseStorageService';

const latestRevision: BlueprintRevision = {
  url: 'https://example.supabase.co/storage/v1/object/public/photovault-media/blueprints/active-plan.jpg?v=revision-new',
  version: 'revision-new',
  updatedAt: '2026-08-26T20:45:00.000Z',
  updatedByName: 'Ing. Laura Gómez',
};

const cloudRevisionState = vi.hoisted(() => {
  let resolveRevision: (revision: unknown) => void;
  const revisionPromise = new Promise<unknown>((resolve) => {
    resolveRevision = resolve;
  });
  return { resolveRevision: resolveRevision!, revisionPromise };
});

vi.mock('../client/src/services/blueprintStorageService', async () => {
  const actual = await vi.importActual<typeof import('../client/src/services/blueprintStorageService')>('../client/src/services/blueprintStorageService');
  return {
    ...actual,
    loadBlueprintImage: vi.fn().mockResolvedValue('data:image/jpeg;base64,copia-local-anterior'),
    saveBlueprintImage: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../client/src/services/supabaseStorageService', async () => {
  const actual = await vi.importActual<typeof import('../client/src/services/supabaseStorageService')>('../client/src/services/supabaseStorageService');
  return {
    ...actual,
    getCloudBlueprintRevision: vi.fn().mockReturnValue(cloudRevisionState.revisionPromise),
  };
});

describe('MapView: estados visibles de sincronización del plano', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('photovault_last_plan_area', 'civil');
    localStorage.setItem('photovault_seen_blueprint_version', 'revision-old');
  });

  it('muestra cargador, aviso de actualización y registro de fecha/autora al inspector', async () => {
    render(
      <MapView
        photos={[]}
        inspector={{
          id: 'inspector-01',
          name: 'Inspector de prueba',
          email: 'inspector@example.com',
          role: 'Inspector',
          terminal: 'Terminal de prueba',
          avatarUrl: '',
          phone: '',
          department: 'Obra',
        }}
        isAdmin={false}
        onSelectPhoto={vi.fn()}
        onEditPhoto={vi.fn()}
        onUpdatePhoto={vi.fn()}
        onDeletePhotos={vi.fn()}
        onNavigateToUpload={vi.fn()}
        onCreatePhoto={vi.fn()}
        onUpdatePhotoPosition={vi.fn()}
        onUpdatePipelineMeasurements={vi.fn()}
      />,
    );

    expect(screen.getByText('Actualizando plano compartido')).toBeTruthy();
    expect(screen.getByText('Descargando la versión más reciente…')).toBeTruthy();

    cloudRevisionState.resolveRevision(latestRevision);

    await waitFor(() => {
      expect(screen.getByText('Plano actualizado por Ing. Laura Gómez. Se descargó la versión más reciente.')).toBeTruthy();
    });

    expect(screen.getByText('Última modificación')).toBeTruthy();
    expect(screen.getByText('Ing. Laura Gómez')).toBeTruthy();
    expect(screen.getByText((content) => content.includes('2026'))).toBeTruthy();
    expect(screen.getByAltText('Plano de obra sin cargar')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Abrir ajustes de vista'));
    expect(screen.getByRole('dialog', { name: 'Ajustes de vista del plano' })).toBeTruthy();
    expect(screen.getByText('Escala y legibilidad')).toBeTruthy();
    expect(screen.getByLabelText('Reducir tamaño del plano')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Abrir herramientas del plano'));
    expect(screen.queryByRole('dialog', { name: 'Ajustes de vista del plano' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Herramientas del plano' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Calibración disponible solo para administradores' })).toBeTruthy();

    fireEvent.click(screen.getByText('Activar mano'));
    expect(screen.queryByRole('dialog', { name: 'Herramientas del plano' })).toBeNull();
    expect(screen.getByAltText('Plano de obra sin cargar')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Abrir herramientas del plano'));
    expect(screen.getByText('Mano activa')).toBeTruthy();
  });
});
