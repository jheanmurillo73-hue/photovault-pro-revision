/**
 * Diseño: cartografía técnica sobria. El modelo conserva categorías operativas
 * independientes para impedir que un elemento del plano herede datos ajenos.
 */
export type SyncStatus = 'Synced' | 'In Progress' | 'Flagged';

export type ExecutionStatus = 'En proceso' | 'Terminado';

export type CameraCode = 'SB850' | 'SB851' | 'SB858' | string;

export type CameraType = 'MT' | 'BT' | 'Datos' | string;

export type ElementType = 'caja' | 'camara' | 'tuberia';

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
  tramo?: string;
  metraje?: number | string;
  latitude?: number;
  longitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  planX?: number;
  planY?: number;
  planEndX?: number;
  planEndY?: number;
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
  element: Pick<InspectionPhoto, 'elementType' | 'tramo' | 'metraje'>,
): ElementType => element.elementType || (element.tramo || element.metraje ? 'tuberia' : 'caja');

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
