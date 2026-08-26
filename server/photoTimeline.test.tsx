// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoDetailView } from '../client/src/components/PhotoDetailView';
import { groupEvidenceTimelineByDate, normalizeEvidenceTimeline, type InspectionPhoto } from '../client/src/types';

const photoWithProgress: InspectionPhoto = {
  id: 'elemento-01',
  displayId: 'EL-001',
  name: 'Cámara de acceso',
  imageUrl: 'https://example.com/evidence-1.jpg',
  imageUrls: [
    'https://example.com/evidence-1.jpg',
    'https://example.com/evidence-2.jpg',
    'https://example.com/evidence-3.jpg',
  ],
  evidenceTimeline: [
    { url: 'https://example.com/evidence-1.jpg', capturedAt: '2026-08-20T08:30:00.000Z' },
    { url: 'https://example.com/evidence-2.jpg', capturedAt: '2026-08-22T13:15:00.000Z' },
    { url: 'https://example.com/evidence-3.jpg', capturedAt: '2026-08-22T17:45:00.000Z' },
  ],
  date: '20 ago 2026',
  dateRaw: '2026-08-20T08:30:00.000Z',
  status: 'Synced',
  executionStatus: 'En proceso',
  category: 'inspection',
  categoryLabel: 'Inspección',
  location: 'Acceso principal',
  inspectorName: 'Inspector de prueba',
  inspectorId: 'inspector-01',
  inspectorAvatar: 'https://example.com/inspector-avatar.jpg',
  type: 'Fotografía',
  elementType: 'camara',
  verified: false,
  fieldNotes: '',
  requiresImmediateAction: false,
};

describe('Historial fotográfico por elemento', () => {
  it('agrupa evidencias por fecha y mantiene el orden cronológico de avance', () => {
    const timeline = normalizeEvidenceTimeline(photoWithProgress);
    const groups = groupEvidenceTimelineByDate(timeline);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ day: '2026-08-20' });
    expect(groups[1]).toMatchObject({ day: '2026-08-22' });
    expect(groups[1].entries).toHaveLength(2);
    expect(groups[1].entries[0].capturedAt).toBe('2026-08-22T13:15:00.000Z');
  });

  it('muestra en el detalle la línea de tiempo agrupada de las evidencias del avance', () => {
    render(
      <PhotoDetailView
        photo={photoWithProgress}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onUpdatePhoto={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Historial fotográfico' })).toBeTruthy();
    expect(screen.getByText('3 evidencias')).toBeTruthy();
    expect(screen.getAllByText('Evidencia de avance')).toHaveLength(3);

    const timelineButtons = screen.getAllByRole('button', { name: /Abrir evidencia tomada a las/i });
    fireEvent.click(timelineButtons[1]);

    expect(screen.getByText(/Foto 2 de 3/)).toBeTruthy();
    const selectedEvidenceViews = screen.getAllByAltText('Cámara de acceso — evidencia 2 de 3');
    expect(selectedEvidenceViews.at(-1)?.getAttribute('src')).toBe('https://example.com/evidence-2.jpg');
  });

  it('mantiene claves únicas cuando dos evidencias comparten URL y fecha', () => {
    const duplicateEvidencePhoto: InspectionPhoto = {
      ...photoWithProgress,
      imageUrls: [...photoWithProgress.imageUrls!, 'https://example.com/evidence-2.jpg'],
      evidenceTimeline: [...photoWithProgress.evidenceTimeline!, {
        url: 'https://example.com/evidence-2.jpg',
        capturedAt: '2026-08-22T13:15:00.000Z',
      }],
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const duplicateTimeline = render(<PhotoDetailView photo={duplicateEvidencePhoto} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onUpdatePhoto={vi.fn()} />);
      expect(within(duplicateTimeline.container).getAllByText('Evidencia de avance')).toHaveLength(4);
      expect(consoleError.mock.calls.some(([message]) => String(message).includes('same key'))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
