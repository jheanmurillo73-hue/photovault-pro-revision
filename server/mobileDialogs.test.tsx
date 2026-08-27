// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditPhotoModal } from '../client/src/components/EditPhotoModal';
import { MapView } from '../client/src/components/MapView';
import { applyPhotoUpdatePermissions } from '../client/src/lib/photoPermissions';
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

vi.mock('../client/src/services/deviceStorageService', () => ({
  compressEvidenceImageForUpload: vi.fn(async (file: File) => ({
    dataUrl: `data:image/jpeg;base64,${file.name}`,
    originalBytes: file.size,
    optimizedBytes: Math.max(1, Math.floor(file.size / 2)),
    profile: { level: 'reforzada', maxWidth: 1600, maxHeight: 1200, quality: 0.72, targetBytes: 1400 * 1024 },
  })),
  formatImageBytes: vi.fn((bytes: number) => `${bytes} B`),
}));

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
    const inspectorCalibration = within(toolsDialog).getByRole('button', { name: 'Calibración disponible solo para administradores' });
    expect(inspectorCalibration.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toolsTrigger);

    const marker = await screen.findByRole('button', { name: 'Abrir o mover SB850' });
    fireEvent.click(marker);

    const dialog = screen.getByRole('dialog', { name: 'SB850 · Cámara móvil' });
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

  it('permite al inspector actualizar el acta cuando administración habilita el permiso', () => {
    const onSave = vi.fn();
    const { container } = render(<EditPhotoModal photo={mobileElement} isOpen isAdmin={false} canAssignActa onClose={vi.fn()} onSave={onSave} />);

    const actaSelect = screen.getByLabelText('Acta asignada');
    expect(actaSelect.hasAttribute('disabled')).toBe(false);
    fireEvent.change(actaSelect, { target: { value: 'Acta 2' } });
    fireEvent.click(screen.getByText('Guardar Cambios'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ acta: 'Acta 2' }));
    expect(container.querySelector<HTMLButtonElement>('#inspection-acta-item-picker')?.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Agregar' })).toBeNull();
  });

  it('bloquea la edición y el guardado del acta al inspector cuando administración deshabilita el permiso', () => {
    const onSave = vi.fn();
    const photoWithActa = { ...mobileElement, acta: 'Acta 1' };
    render(<EditPhotoModal photo={photoWithActa} isOpen isAdmin={false} canAssignActa={false} onClose={vi.fn()} onSave={onSave} />);

    const actaSelect = screen.getByLabelText('Acta asignada');
    expect(actaSelect.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('La administración inhabilitó la asignación de actas para inspectores.')).toBeTruthy();
    fireEvent.click(screen.getByText('Guardar Cambios'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ acta: 'Acta 1' }));
  });

  it('conserva para administración la edición del acta aun cuando inspectores estén bloqueados', () => {
    const onSave = vi.fn();
    render(<EditPhotoModal photo={mobileElement} isOpen isAdmin canAssignActa={false} onClose={vi.fn()} onSave={onSave} />);

    const actaSelect = screen.getByLabelText('Acta asignada');
    expect(actaSelect.hasAttribute('disabled')).toBe(false);
    fireEvent.change(actaSelect, { target: { value: 'Acta 3' } });
    fireEvent.click(screen.getByText('Guardar Cambios'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ acta: 'Acta 3' }));
  });

  it('protege el acta actual ante un intento de actualización no autorizado fuera del formulario', () => {
    const current: InspectionPhoto = {
      ...mobileElement,
      acta: 'Acta 1',
      actaItem: { code: '1.01', description: 'Ítem contractual vigente', unit: 'UND', quantity: '1', section: 'Obra civil' },
    };
    const updated: InspectionPhoto = {
      ...current,
      acta: 'Acta 8',
      actaItem: { code: '9.99', description: 'Ítem contractual alterado', unit: 'UND', quantity: '1', section: 'Obra civil' },
    };

    const protectedUpdate = applyPhotoUpdatePermissions({
      current,
      updated,
      isAdmin: false,
      canAssignActa: false,
    });

    expect(protectedUpdate).toMatchObject({
      acta: 'Acta 1',
      actaItem: { code: '1.01', description: 'Ítem contractual vigente' },
    });
  });

  it('permite guardar más de seis fotos de evidencia en las propiedades del elemento', async () => {
    const onSave = vi.fn();
    const { container } = render(<EditPhotoModal photo={mobileElement} isOpen isAdmin onClose={vi.fn()} onSave={onSave} />);
    const galleryInput = container.querySelector('input[type="file"][multiple]');
    const additionalPhotos = Array.from({ length: 7 }, (_, index) => new File([`foto-${index + 1}`], `evidencia-${index + 1}.jpg`, { type: 'image/jpeg' }));

    fireEvent.change(galleryInput!, { target: { files: additionalPhotos } });

    await waitFor(() => expect(screen.getByText(/8\/20 fotos/)).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('Compresión reforzada');
    fireEvent.click(screen.getByText('Guardar Cambios'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imageUrls: expect.arrayContaining(['https://example.com/camera.jpg']) }));
    expect(onSave.mock.calls[0][0].imageUrls).toHaveLength(8);
  });

  it('muestra la calibración únicamente al administrador dentro de Herramientas', async () => {
    render(
      <MapView
        photos={[mobileElement]}
        inspector={{ id: 'admin-mobile', name: 'Administrador móvil', email: 'admin@example.com', role: 'Administrador', terminal: 'Móvil', avatarUrl: '', phone: '', department: 'Obra' }}
        isAdmin
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

    fireEvent.click(await screen.findByTitle('Abrir herramientas del plano'));
    const toolsDialog = screen.getByRole('dialog', { name: 'Herramientas del plano' });
    expect(within(toolsDialog).getByText('Calibrar plano')).toBeTruthy();
    expect(within(toolsDialog).queryByRole('button', { name: 'Calibración disponible solo para administradores' })).toBeNull();
  });
});
