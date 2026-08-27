import { ExecutionStatus, InspectionPhoto, getElementType } from '../types';

export const EXECUTION_STATUSES: ReadonlyArray<ExecutionStatus> = ['No iniciado', 'En proceso', 'Terminado'];

export interface StatusBreakdown {
  'No iniciado': number;
  'En proceso': number;
  Terminado: number;
  total: number;
}

export interface WorkElementStatistics {
  cameras: Record<'MT' | 'BT' | 'Datos', StatusBreakdown>;
  pipes: Record<'MT' | 'BT' | 'Datos', StatusBreakdown>;
  totalCameras: number;
  totalPipes: number;
}

const emptyBreakdown = (): StatusBreakdown => ({
  'No iniciado': 0,
  'En proceso': 0,
  Terminado: 0,
  total: 0,
});

const normalizeCameraType = (value?: string): 'MT' | 'BT' | 'Datos' | null => {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'MT') return 'MT';
  if (normalized === 'BT') return 'BT';
  if (normalized === 'DATOS' || normalized === 'D') return 'Datos';
  return null;
};

const getPipeTypes = (photo: InspectionPhoto): Array<'MT' | 'BT' | 'Datos'> => {
  const networks = photo.pipeConduits?.length
    ? photo.pipeConduits.map((conduit) => conduit.networkType)
    : photo.pipeNetworkType ? [photo.pipeNetworkType] : [];
  return Array.from(new Set(networks)).flatMap((network) => {
    if (network === 'media_tension') return ['MT'];
    if (network === 'baja_tension') return ['BT'];
    if (network === 'datos') return ['Datos'];
    return [];
  });
};

const addToBreakdown = (breakdown: StatusBreakdown, status: ExecutionStatus) => {
  breakdown[status] += 1;
  breakdown.total += 1;
};

export const getWorkElementStatistics = (photos: InspectionPhoto[]): WorkElementStatistics => {
  const cameras: WorkElementStatistics['cameras'] = {
    MT: emptyBreakdown(),
    BT: emptyBreakdown(),
    Datos: emptyBreakdown(),
  };
  const pipes: WorkElementStatistics['pipes'] = {
    MT: emptyBreakdown(),
    BT: emptyBreakdown(),
    Datos: emptyBreakdown(),
  };
  let totalCameras = 0;
  let totalPipes = 0;

  photos.forEach((photo) => {
    const elementType = getElementType(photo);
    if (elementType === 'camara') {
      totalCameras += 1;
      const cameraType = normalizeCameraType(photo.cameraType);
      if (cameraType) addToBreakdown(cameras[cameraType], photo.executionStatus);
      return;
    }

    if (elementType === 'tuberia') {
      totalPipes += 1;
      getPipeTypes(photo).forEach((pipeType) => addToBreakdown(pipes[pipeType], photo.executionStatus));
    }
  });

  return { cameras, pipes, totalCameras, totalPipes };
};
