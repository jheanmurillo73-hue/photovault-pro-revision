/**
 * Diseño: cartografía técnica sobria. El modelo conserva categorías operativas
 * independientes para impedir que un elemento del plano herede datos ajenos.
 */
export type SyncStatus = 'Synced' | 'In Progress' | 'Flagged';

export type ExecutionStatus = 'En proceso' | 'Terminado';

export type CameraCode = 'SB850' | 'SB851' | 'SB858' | string;

export type CameraType = 'MT' | 'BT' | 'Datos' | string;

export type ElementType = 'caja' | 'camara' | 'tuberia' | 'electrico';

export type PlanLayer = 'civil' | 'electrical';

export type ElectricalElementType =
  | 'transformador'
  | 'barrajes_elastomericos'
  | 'tablero_distribucion'
  | 'malla_tierra'
  | 'poste_iluminacion'
  | 'poste_media_tension'
  | 'reconectador'
  | 'cable_media_tension'
  | 'cable_baja_tension'
  | 'cable_datos';

export const ELECTRICAL_ELEMENT_OPTIONS: ReadonlyArray<{
  value: ElectricalElementType;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  linear?: boolean;
}> = [
  { value: 'transformador', label: 'Transformador', shortLabel: 'Transformador', icon: 'transform', color: '#7C3AED' },
  { value: 'barrajes_elastomericos', label: 'Barrajes elastoméricos', shortLabel: 'Barrajes', icon: 'splitscreen', color: '#C2410C' },
  { value: 'tablero_distribucion', label: 'Tablero de distribución', shortLabel: 'Tablero', icon: 'developer_board', color: '#075985' },
  { value: 'malla_tierra', label: 'Malla a tierra', shortLabel: 'Malla a tierra', icon: 'grid_4x4', color: '#15803D' },
  { value: 'poste_iluminacion', label: 'Poste de iluminación', shortLabel: 'Poste iluminación', icon: 'light', color: '#CA8A04' },
  { value: 'poste_media_tension', label: 'Poste de media tensión', shortLabel: 'Poste MT', icon: 'cell_tower', color: '#B91C1C' },
  { value: 'reconectador', label: 'Reconectador', shortLabel: 'Reconectador', icon: 'power', color: '#9F1239' },
  { value: 'cable_media_tension', label: 'Cableado de media tensión', shortLabel: 'Cable MT', icon: 'cable', color: '#DC2626', linear: true },
  { value: 'cable_baja_tension', label: 'Cableado de baja tensión', shortLabel: 'Cable BT', icon: 'cable', color: '#EAB308', linear: true },
  { value: 'cable_datos', label: 'Cableado de datos', shortLabel: 'Cable datos', icon: 'settings_ethernet', color: '#0D9FC6', linear: true },
];

export const getElectricalElementOption = (value?: string) =>
  ELECTRICAL_ELEMENT_OPTIONS.find((option) => option.value === value) || ELECTRICAL_ELEMENT_OPTIONS[0];

export const isElectricalElementType = (value?: string): value is ElectricalElementType =>
  ELECTRICAL_ELEMENT_OPTIONS.some((option) => option.value === value);

export const isElectricalCableType = (value?: string) =>
  Boolean(getElectricalElementOption(value).linear) && isElectricalElementType(value);

export type PipeNetworkType = 'media_tension' | 'baja_tension' | 'datos';

export const PIPE_NETWORK_OPTIONS: ReadonlyArray<{
  value: PipeNetworkType;
  label: string;
  color: string;
  icon: string;
}> = [
  { value: 'media_tension', label: 'Media tensión', color: '#DC2626', icon: 'bolt' },
  { value: 'baja_tension', label: 'Baja tensión', color: '#EAB308', icon: 'electric_bolt' },
  { value: 'datos', label: 'Datos', color: '#0D9FC6', icon: 'lan' },
];

export const getPipeNetworkOption = (value?: string) =>
  PIPE_NETWORK_OPTIONS.find((option) => option.value === value) || PIPE_NETWORK_OPTIONS[1];

export type ActaLabelPosition = 'arriba' | 'abajo' | 'izquierda' | 'derecha';

export type AppRole = 'admin' | 'inspector';

export type AppModule =
  | 'dashboard'
  | 'map'
  | 'database'
  | 'upload'
  | 'history'
  | 'activity'
  | 'settings';

export interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  allowedModules: AppModule[];
  emailConfirmedAt?: string | null;
}

export type PhotoCategory = 'inspection' | 'maintenance' | 'site_visit' | 'safety_hazard' | 'structural' | 'electrical';

export interface InspectionPhoto {
  id: string;
  displayId: string;
  name: string;
  imageUrl: string;
  date: string;
  dateRaw: string;
  status: SyncStatus;
  executionStatus: ExecutionStatus;
  category: PhotoCategory;
  categoryLabel: string;
  location: string;
  cameraCode?: CameraCode;
  cameraType?: CameraType;
  acta?: string;
  showActaLabel?: boolean;
  actaLabelPosition?: ActaLabelPosition;
  tramo?: string;
  metraje?: number | string;
  pipeNetworkType?: PipeNetworkType;
  pipeColor?: string;
  latitude?: number;
  longitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  planX?: number;
  planY?: number;
  planEndX?: number;
  planEndY?: number;
  planLayer?: PlanLayer;
  electricalType?: ElectricalElementType;
  electricalColor?: string;
  inspectorName: string;
  inspectorId: string;
  inspectorAvatar: string;
  type: string;
  elementType?: ElementType;
  verified: boolean;
  fieldNotes: string;
  requiresImmediateAction: boolean;
  fileSize?: string;
  resolution?: string;
}

/**
 * Mantiene los registros creados antes de esta mejora: aquellos con metraje o
 * tramo se interpretan como tubería; el resto conserva el comportamiento de caja.
 */
export const getElementType = (
  element: Pick<InspectionPhoto, 'elementType' | 'tramo' | 'metraje' | 'electricalType' | 'planLayer'>,
): ElementType => element.elementType || (element.electricalType || element.planLayer === 'electrical' ? 'electrico' : element.tramo || element.metraje ? 'tuberia' : 'caja');

export interface BlueprintOverlay {
  id: string;
  name: string;
  imageUrl: string;
  opacity: number; // 0 to 1
  visible: boolean;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  rotation?: number; // degrees
  scale?: number;
  calibration?: BlueprintCalibration;
}

/**
 * Escala construida al marcar un tramo conocido del JPG. Las unidades del
 * plano preservan la relación de aspecto, por lo que el zoom no afecta el
 * cálculo final en metros.
 */
export interface BlueprintCalibration {
  referenceDistanceMeters: number;
  referenceDistancePlanUnits: number;
  aspectRatio: number;
  calibratedAt: string;
}

export interface InspectorProfile {
  name: string;
  role: string;
  terminal: string;
  id: string;
  email: string;
  avatarUrl: string;
  phone: string;
  department: string;
  // Basic personal data
  documentId?: string; // Cédula / DNI / RUT
  birthDate?: string; // Fecha de nacimiento
  gender?: string; // Género
  city?: string; // Ciudad de residencia
  address?: string; // Dirección
  bloodType?: string; // Grupo Sanguíneo RH (O+, A+, B+, etc.)
  // Emergency contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // Professional & contractor data
  company?: string; // Empresa o Consorcio Contratista
  licenseNumber?: string; // Matrícula Profesional / Certificado CONTE / RETIE
  notes?: string; // Observaciones o notas médicas
}

export interface AppSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  syncWifiOnly: boolean;
  highQualityUploads: boolean;
  autoVerifyPassed: boolean;
  offlineStorageLimitMb: number;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  photoName: string;
  photoId: string;
  user: string;
  type: 'upload' | 'sync' | 'edit' | 'flag' | 'verified';
}

export interface InspectionCollection {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  coverImage: string;
  category: string;
  lastUpdated: string;
  photoIds: string[];
}
