import { describe, expect, it } from 'vitest';
import { InspectionPhoto } from '../client/src/types';
import { getWorkElementStatistics } from '../client/src/lib/workElementStatistics';

const photo = (overrides: Partial<InspectionPhoto>): InspectionPhoto => ({
  id: crypto.randomUUID(),
  displayId: 'INSP-1',
  name: 'Elemento de prueba',
  imageUrl: '',
  date: '27 ago 2026',
  dateRaw: '2026-08-27',
  status: 'Synced',
  executionStatus: 'En proceso',
  category: 'inspection',
  categoryLabel: 'Inspección',
  location: 'Plano',
  inspectorName: 'Inspector',
  inspectorId: '1',
  inspectorAvatar: '',
  type: 'Fotografía',
  verified: false,
  fieldNotes: '',
  requiresImmediateAction: false,
  ...overrides,
});

describe('Estadísticas de elementos de obra', () => {
  it('desglosa cámaras por tipo y estado de ejecución', () => {
    const statistics = getWorkElementStatistics([
      photo({ elementType: 'camara', cameraType: 'MT', executionStatus: 'Terminado' }),
      photo({ elementType: 'camara', cameraType: 'BT', executionStatus: 'En proceso' }),
      photo({ elementType: 'camara', cameraType: 'Datos', executionStatus: 'No iniciado' }),
    ]);

    expect(statistics.totalCameras).toBe(3);
    expect(statistics.cameras.MT.Terminado).toBe(1);
    expect(statistics.cameras.BT['En proceso']).toBe(1);
    expect(statistics.cameras.Datos['No iniciado']).toBe(1);
  });

  it('desglosa tramos por cada conducción técnica que contienen', () => {
    const statistics = getWorkElementStatistics([
      photo({
        elementType: 'tuberia',
        executionStatus: 'Terminado',
        pipeConduits: [
          { id: 'mt', networkType: 'media_tension', configuration: '3x4"', meters: 20 },
          { id: 'datos', networkType: 'datos', configuration: '3x4"', meters: 20 },
        ],
      }),
      photo({ elementType: 'tuberia', pipeNetworkType: 'baja_tension', executionStatus: 'No iniciado' }),
    ]);

    expect(statistics.totalPipes).toBe(2);
    expect(statistics.pipes.MT.Terminado).toBe(1);
    expect(statistics.pipes.Datos.Terminado).toBe(1);
    expect(statistics.pipes.BT['No iniciado']).toBe(1);
  });
});
