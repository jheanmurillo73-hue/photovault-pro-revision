// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditPhotoModal } from '../client/src/components/EditPhotoModal';
import { MapView } from '../client/src/components/MapView';
import type { InspectionPhoto } from '../client/src/types';

const mobileElement: InspectionPhoto = {
  id: 'mobile-camera-01',
  displayId: 'MOB-001',
  name: 'Cámara móvil',
  imageUrl: 'https://example.com/camera.jpg',
  imageUrls: ['https://example.com/camera.jpg'],
  date: '26 ago 2026',
  dateRaw: '2026-08-26T12:00:00.000Z',
  status: 'Synced',
  executionStatus: 'En proceso',
  category: 'inspection',
  categoryLabel: 'Inspección',
  location: 'Zona móvil',
  cameraCode: 'SB850',
  cameraType: 'MT',
  inspectorName: 'Inspector móvil',
  inspectorId: 'inspector-mobile',
  inspectorAvatar: 'https://example.com/avatar.jpg',
  type: 'Fotografía',
  elementType: 'camara',
  planX: 50,
  planY: 50,
  verified: false,
  fieldNotes: '',
  requiresImmediateAction: false,
};

vi.mock('../client/src/services/blueprintStorageService', async () => {
  const actual = await vi.importActual<typeof import('../client/src/services/blueprintStorageService')>('../client/src/services/blueprintStorageService');
  return { ...actual, loadBlueprintImage: vi.fn().mockResolvedValue(null), saveBlueprintImage: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../client/src/services/supabaseStorageService', async () => {
  const actual = await vi.importActual<typeof import('../client/src/services/supabaseStorageService')>('../client/src/services/supabaseStorageService');
  return {
    ...actual,
    getCloudBlueprintRevision: vi.fn().mockResolvedValue({
      url: 'https://example.com/mobile-blueprint.jpg?v=mobile',
      version: 'mobile',
      updatedAt: '2026-08-26T12:00:00.000Z',
      updatedByName: 'Administrador',
    }),
  };
});

describe('Diálogos del plano en móvil', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('photovault_last_plan_area', 'civil');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  });

  afterEach(() => cleanup());

  it('abre el elemento seleccionado como hoja móvil desplazable con sus acciones visibles', async () => {
    render(
      <MapView
        photos={[mobileElement]}
        inspector={{ id: 'inspector-mobile', name: 'Inspector móvil', email: 'mobile@example.com', role: 'Inspector', terminal: 'Móvil', avatarUrl: '', phone: '', department: 'Obra' }}
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

    const viewTrigger = await screen.findByTitle('Abrir ajustes de vista');
    expect(viewTrigger.className).toContain('h-11');
    expect(viewTrigger.className).toContain('w-11');
    const secondaryAccesses = screen.getByTestId('secondary-map-accesses');
    const collapseAccesses = screen.getByRole('button', { name: 'Ocultar accesos secundarios' });
    expect(secondaryAccesses.className).toBe('contents');
    fireEvent.click(collapseAccesses);
    expect(secondaryAccesses.className).toBe('hidden sm:contents');
    expect(screen.getByRole('button', { name: 'Mostrar accesos secundarios' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar accesos secundarios' }));
    expect(secondaryAccesses.className).toBe('contents');
    fireEvent.click(viewTrigger);

    const viewDialog = screen.getByRole('dialog', { name: 'Ajustes de vista del plano' });
    expect(viewDialog.className).toContain('fixed');
    expect(viewDialog.className).toContain('left-2');
    expect(viewDialog.className).toContain('right-2');
    expect(viewDialog.className).toContain('max-h-[calc(100dvh-5.25rem)]');
    fireEvent.click(viewTrigger);

    const toolsTrigger = screen.getByTitle('Abrir herramientas del plano');
    expect(toolsTrigger.className).toContain('h-11');
    expect(toolsTrigger.className).toContain('w-11');
    fireEvent.click(toolsTrigger);

    const toolsDialog = screen.getByRole('dialog', { name: 'Herramientas del plano' });
    expect(toolsDialog.className).toContain('fixed');
    expect(toolsDialog.className).toContain('left-2');
    expect(toolsDialog.className).toContain('right-2');
    expect(toolsDialog.className).toContain('max-h-[calc(100dvh-5.25rem)]');
    fireEvent.click(toolsTrigger);

    const marker = await screen.findByRole('button', { name: 'Abrir o mover SB850' });
    fireEvent.click(marker);

    const dialog = screen.getByRole('dialog', { name: 'SB850' });
    expect(dialog.className).toContain('max-h-[calc(100dvh-1rem)]');
    expect(dialog.className).toContain('rounded-t-2xl');
    expect(screen.getByText('Propiedades').closest('button')?.className).toContain('h-10');
    expect(within(dialog).getByLabelText('Cerrar propiedades del elemento').className).toContain('h-10');
  });

  it('mantiene el modal de propiedades con scroll interno y guardar/cancelar al alcance', () => {
    render(<EditPhotoModal photo={mobileElement} isOpen isAdmin={false} onClose={vi.fn()} onSave={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Editar Detalles de la Inspección' });
    expect(dialog.className).toContain('max-h-[calc(100dvh-0.5rem)]');
    expect(dialog.className).toContain('rounded-t-2xl');
    expect(screen.getByText('Guardar Cambios').className).toContain('h-10');
    expect(screen.getByText('Cancelar').className).toContain('h-10');
  });
});
