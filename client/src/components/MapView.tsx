/**
 * Diseño: plano técnico operativo. El JPG es el lienzo principal, se ajusta por
 * completo al área disponible y las ubicaciones se expresan como porcentajes
 * relativos al plano, nunca como coordenadas de un proveedor cartográfico.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActaLabelPosition, BlueprintCalibration, BlueprintOverlay, ElectricalElementType, ELECTRICAL_ELEMENT_OPTIONS, getElectricalElementOption, getElementType, getPipeNetworkOption, InspectionPhoto, InspectorProfile, isElectricalCableType, isElectricalElementType, PIPE_NETWORK_OPTIONS, PipeNetworkType } from '../types';
import { compressImageForDevice } from '../services/deviceStorageService';
import { isQuotaExceededError, loadBlueprintImage, saveBlueprintImage } from '../services/blueprintStorageService';

interface MapViewProps {
  photos: InspectionPhoto[];
  inspector: InspectorProfile;
  onSelectPhoto: (photo: InspectionPhoto) => void;
  onEditPhoto: (photo: InspectionPhoto) => void;
  onUpdatePhoto: (photo: InspectionPhoto) => void;
  onDeletePhotos: (photoIds: string[]) => void;
  onNavigateToUpload: () => void;
  onCreatePhoto: (
    elementType: 'caja' | 'camara' | 'tuberia' | 'electrico',
    position: Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'>,
    initialMetraje?: number,
    electricalType?: ElectricalElementType,
  ) => InspectionPhoto;
  onUpdatePhotoPosition: (
    photoId: string,
    position: Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'> & Partial<Pick<InspectionPhoto, 'metraje'>>,
  ) => void;
  onUpdatePipelineMeasurements: (measurements: Array<Pick<InspectionPhoto, 'id' | 'metraje'>>) => void;
}

type PlacementStage = 'point' | 'pipe-start' | 'pipe-end';
type PipeAlignment = 'libre' | 'horizontal' | 'vertical' | 'diagonal';
type CreationMode = 'caja' | 'camara' | 'tuberia' | ElectricalElementType;

interface PlacementTarget {
  photo: InspectionPhoto;
  stage: PlacementStage;
}

interface DragTarget {
  photo: InspectionPhoto;
  source: 'palette' | 'plan';
}

interface PlanPoint {
  planX: number;
  planY: number;
}

interface CalibrationDraft {
  referenceDistancePlanUnits: number;
  referenceDistancePercent: number;
  aspectRatio: number;
}

const EMPTY_BLUEPRINT: BlueprintOverlay = {
  id: 'bp-user',
  name: 'Plano de obra sin cargar',
  imageUrl: '',
  opacity: 1,
  visible: true,
  bounds: { north: 0, south: 0, east: 0, west: 0 },
  rotation: 0,
  scale: 1,
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const clampScale = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const getPercentDistance = (start: PlanPoint, end: PlanPoint) =>
  Math.hypot(end.planX - start.planX, end.planY - start.planY);
const getPlanDistanceUnits = (start: PlanPoint, end: PlanPoint, aspectRatio: number) =>
  Math.hypot(((end.planX - start.planX) / 100) * aspectRatio, (end.planY - start.planY) / 100);
const getMetersFromPlanPoints = (
  start: PlanPoint,
  end: PlanPoint,
  calibration?: BlueprintCalibration,
) => {
  if (!calibration || calibration.referenceDistancePlanUnits <= 0) return null;
  const units = getPlanDistanceUnits(start, end, calibration.aspectRatio);
  return units * (calibration.referenceDistanceMeters / calibration.referenceDistancePlanUnits);
};
const roundMeters = (value: number) => Math.round(value * 100) / 100;
const alignPipeEnd = (start: PlanPoint, end: PlanPoint, alignment: PipeAlignment): PlanPoint => {
  if (alignment === 'horizontal') return { planX: end.planX, planY: start.planY };
  if (alignment === 'vertical') return { planX: start.planX, planY: end.planY };
  if (alignment === 'diagonal') {
    const distance = Math.max(Math.abs(end.planX - start.planX), Math.abs(end.planY - start.planY));
    return {
      planX: clampPercent(start.planX + Math.sign(end.planX - start.planX || 1) * distance),
      planY: clampPercent(start.planY + Math.sign(end.planY - start.planY || 1) * distance),
    };
  }
  return end;
};

const getActaLabelStyle = (
  planX: number,
  planY: number,
  position: ActaLabelPosition | undefined,
  offset: number,
  textScale: number,
): React.CSSProperties => {
  const base = { left: `${planX}%`, top: `${planY}%` };
  switch (position || 'derecha') {
    case 'izquierda':
      return { ...base, transform: `translate(calc(-100% - ${offset}px), -50%) scale(${textScale})`, transformOrigin: 'right center' };
    case 'arriba':
      return { ...base, transform: `translate(-50%, calc(-100% - ${offset}px)) scale(${textScale})`, transformOrigin: 'center bottom' };
    case 'abajo':
      return { ...base, transform: `translate(-50%, ${offset}px) scale(${textScale})`, transformOrigin: 'center top' };
    default:
      return { ...base, transform: `translate(${offset}px, -50%) scale(${textScale})`, transformOrigin: 'left center' };
  }
};

const getCameraNameStyle = (
  planX: number,
  planY: number,
  offset: number,
  textScale: number,
): React.CSSProperties => ({
  left: `${planX}%`,
  top: `${planY}%`,
  transform: `translate(${offset}px, calc(-100% - 2px)) scale(${textScale})`,
  transformOrigin: 'left bottom',
});

const isPlaced = (photo: InspectionPhoto) =>
  typeof photo.planX === 'number' && typeof photo.planY === 'number';

const hasCompletePipe = (photo: InspectionPhoto) =>
  isPlaced(photo)
  && typeof photo.planEndX === 'number'
  && typeof photo.planEndY === 'number';

const isElectricalPhoto = (photo: InspectionPhoto) =>
  photo.planLayer === 'electrical' && isElectricalElementType(photo.electricalType);

const isLinearPlanElement = (photo: InspectionPhoto) =>
  getElementType(photo) === 'tuberia' || (isElectricalPhoto(photo) && isElectricalCableType(photo.electricalType));

const isLinearCreationMode = (mode: CreationMode | null) =>
  mode === 'tuberia' || isElectricalCableType(mode || undefined);

const elementLabel = (photo: InspectionPhoto) => {
  const type = getElementType(photo);
  if (isElectricalPhoto(photo)) return getElectricalElementOption(photo.electricalType).label;
  if (type === 'camara') return photo.cameraCode || 'Cámara sin código';
  if (type === 'tuberia') return photo.tramo ? `Tramo ${photo.tramo}` : 'Tubería sin tramo';
  return photo.name || 'Caja sin nombre';
};

const cameraNameLabel = (photo: InspectionPhoto) => photo.name?.trim() || photo.cameraCode || 'Cámara sin nombre';

export const MapView: React.FC<MapViewProps> = ({
  photos,
  inspector,
  onSelectPhoto,
  onEditPhoto,
  onUpdatePhoto,
  onDeletePhotos,
  onNavigateToUpload,
  onCreatePhoto,
  onUpdatePhotoPosition,
  onUpdatePipelineMeasurements,
}) => {
  const [blueprint, setBlueprint] = useState<BlueprintOverlay>(() => {
    const saved = localStorage.getItem('photovault_blueprint');
    if (!saved) return EMPTY_BLUEPRINT;
    try {
      const parsed = JSON.parse(saved) as Partial<BlueprintOverlay>;
      return {
        ...EMPTY_BLUEPRINT,
        ...parsed,
        imageUrl: '',
        opacity: 1,
        visible: true,
      };
    } catch {
      return EMPTY_BLUEPRINT;
    }
  });
  const [activeFilter, setActiveFilter] = useState<'all' | 'camara' | 'caja' | 'tuberia' | 'electrico' | 'pending'>('all');
  const [activePlanLayer, setActivePlanLayer] = useState<'all' | 'civil' | 'electrical'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [placement, setPlacement] = useState<PlacementTarget | null>(null);
  const [creationMode, setCreationMode] = useState<CreationMode | null>(null);
  const [pipeStart, setPipeStart] = useState<PlanPoint | null>(null);
  const [pipePreview, setPipePreview] = useState<PlanPoint | null>(null);
  const [pipeAlignment, setPipeAlignment] = useState<PipeAlignment>('libre');
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationStart, setCalibrationStart] = useState<PlanPoint | null>(null);
  const [calibrationPreview, setCalibrationPreview] = useState<PlanPoint | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft | null>(null);
  const [calibrationMeters, setCalibrationMeters] = useState('10');
  const [isCalibrationDialogOpen, setIsCalibrationDialogOpen] = useState(false);
  const [selectedPlanPhotoId, setSelectedPlanPhotoId] = useState<string | null>(null);
  const [isMultipleSelectionMode, setIsMultipleSelectionMode] = useState(false);
  const [selectedPlanPhotoIds, setSelectedPlanPhotoIds] = useState<string[]>([]);
  const [photosPendingDeletion, setPhotosPendingDeletion] = useState<InspectionPhoto[]>([]);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [iconScale, setIconScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem('photovault_plan_icon_scale'));
    return Number.isFinite(saved) ? clampScale(saved, 0.4, 1.8) : 1;
  });
  const [textScale, setTextScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem('photovault_plan_text_scale'));
    return Number.isFinite(saved) ? clampScale(saved, 0.5, 1.8) : 1;
  });
  const [areActaLabelsVisible, setAreActaLabelsVisible] = useState<boolean>(() =>
    localStorage.getItem('photovault_plan_acta_labels_visible') !== 'false',
  );
  const [areCameraNamesVisible, setAreCameraNamesVisible] = useState<boolean>(() =>
    localStorage.getItem('photovault_plan_camera_names_visible') !== 'false',
  );
  const [blueprintStorageNotice, setBlueprintStorageNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blueprintStorageReadyRef = useRef(false);
  const dragTargetRef = useRef<DragTarget | null>(null);

  useEffect(() => {
    let active = true;
    const restoreUserBlueprint = async () => {
      try {
        const storedImage = await loadBlueprintImage();
        const isLegacySvg = storedImage?.startsWith('data:image/svg+xml');
        if (active && storedImage && !isLegacySvg) {
          setBlueprint((previous) => ({ ...previous, imageUrl: storedImage, visible: true, opacity: 1 }));
        }
      } catch {
        // El usuario siempre puede volver a cargar un JPG si el navegador no expone IndexedDB.
      } finally {
        blueprintStorageReadyRef.current = true;
      }
    };

    void restoreUserBlueprint();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!blueprintStorageReadyRef.current) return;
    const persistUserBlueprint = async () => {
      const { imageUrl, ...metadata } = blueprint;
      try {
        localStorage.setItem('photovault_blueprint', JSON.stringify({ ...metadata, imageUrl: '' }));
      } catch {
        setBlueprintStorageNotice('No se pudieron guardar los ajustes del plano en este dispositivo.');
      }

      if (!imageUrl) return;
      try {
        await saveBlueprintImage(imageUrl);
        setBlueprintStorageNotice(null);
      } catch (error) {
        setBlueprintStorageNotice(
          isQuotaExceededError(error)
            ? 'El JPG es demasiado grande para el almacenamiento disponible. Se mantendrá durante esta sesión.'
            : 'No se pudo conservar el JPG para la próxima sesión.',
        );
      }
    };

    void persistUserBlueprint();
  }, [blueprint]);

  useEffect(() => {
    try {
      localStorage.setItem('photovault_plan_icon_scale', String(iconScale));
    } catch {
      // La escala permanece disponible durante la sesión aunque el navegador no permita persistirla.
    }
  }, [iconScale]);

  useEffect(() => {
    try {
      localStorage.setItem('photovault_plan_text_scale', String(textScale));
    } catch {
      // La escala de textos queda disponible en la sesión aunque no pueda persistirse.
    }
  }, [textScale]);

  useEffect(() => {
    try {
      localStorage.setItem('photovault_plan_acta_labels_visible', String(areActaLabelsVisible));
    } catch {
      // El estado se conserva durante la sesión aunque el navegador no permita persistirlo.
    }
  }, [areActaLabelsVisible]);

  useEffect(() => {
    try {
      localStorage.setItem('photovault_plan_camera_names_visible', String(areCameraNamesVisible));
    } catch {
      // El estado se conserva durante la sesión aunque el navegador no permita persistirlo.
    }
  }, [areCameraNamesVisible]);

  useEffect(() => {
    if (!isPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isPanelOpen]);

  const pendingPhotos = useMemo(
    () => photos.filter((photo) => {
      return isLinearPlanElement(photo) ? !hasCompletePipe(photo) : !isPlaced(photo);
    }),
    [photos],
  );

  const visiblePhotos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return photos.filter((photo) => {
      const type = getElementType(photo);
      if (activePlanLayer !== 'all' && photo.planLayer !== activePlanLayer) return false;
      if (activeFilter === 'pending' && !pendingPhotos.some((pending) => pending.id === photo.id)) return false;
      if (activeFilter !== 'all' && activeFilter !== 'pending' && type !== activeFilter) return false;
      if (!query) return true;
      return [photo.name, photo.cameraCode, photo.tramo, photo.location, photo.metraje]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeFilter, activePlanLayer, pendingPhotos, photos, searchQuery]);

  const positionedPhotos = useMemo(
    () => visiblePhotos.filter((photo) => isPlaced(photo)),
    [visiblePhotos],
  );

  const totalPipelineMeters = useMemo(
    () => photos
      .filter((photo) => getElementType(photo) === 'tuberia')
      .reduce((total, photo) => total + (Number.parseFloat(String(photo.metraje ?? 0)) || 0), 0),
    [photos],
  );

  const selectedPlanPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedPlanPhotoId) ?? null,
    [photos, selectedPlanPhotoId],
  );

  const selectedMultiplePlanPhotos = useMemo(
    () => photos.filter((photo) => selectedPlanPhotoIds.includes(photo.id)),
    [photos, selectedPlanPhotoIds],
  );

  const exitMultipleSelection = () => {
    setIsMultipleSelectionMode(false);
    setSelectedPlanPhotoIds([]);
  };

  const toggleMultipleSelectionMode = () => {
    if (isMultipleSelectionMode) {
      exitMultipleSelection();
      return;
    }
    setPlacement(null);
    setCreationMode(null);
    setPipeStart(null);
    setPipePreview(null);
    setSelectedPlanPhotoId(null);
    setIsMultipleSelectionMode(true);
  };

  const togglePlanPhotoSelection = (photoId: string) => {
    setSelectedPlanPhotoIds((previous) => (
      previous.includes(photoId)
        ? previous.filter((id) => id !== photoId)
        : [...previous, photoId]
    ));
  };

  const activateCreation = (elementType: CreationMode) => {
    exitMultipleSelection();
    setPlacement(null);
    setSelectedPlanPhotoId(null);
    setPipeStart(null);
    setPipePreview(null);
    if (!isLinearCreationMode(elementType)) setPipeAlignment('libre');
    setCreationMode((previous) => (previous === elementType ? null : elementType));
  };

  const selectForPlacement = (photo: InspectionPhoto) => {
    if (isLinearPlanElement(photo)) {
      setPlacement({ photo, stage: isPlaced(photo) ? 'pipe-end' : 'pipe-start' });
    } else {
      setPlacement({ photo, stage: 'point' });
    }
    setIsPanelOpen(false);
  };

  const startCalibration = () => {
    if (!blueprint.imageUrl) {
      setBlueprintStorageNotice('Carga primero el plano JPG para poder calibrarlo.');
      return;
    }
    exitMultipleSelection();
    setPlacement(null);
    setCreationMode(null);
    setPipeStart(null);
    setPipePreview(null);
    setSelectedPlanPhotoId(null);
    setCalibrationDraft(null);
    setCalibrationPreview(null);
    setCalibrationStart(null);
    setCalibrationMode(true);
  };

  const cancelCalibration = () => {
    setCalibrationMode(false);
    setCalibrationStart(null);
    setCalibrationPreview(null);
    setCalibrationDraft(null);
    setIsCalibrationDialogOpen(false);
  };

  const getCalibratedMeters = (
    position: Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'>,
    calibration = blueprint.calibration,
  ) => {
    if (
      typeof position.planX !== 'number'
      || typeof position.planY !== 'number'
      || typeof position.planEndX !== 'number'
      || typeof position.planEndY !== 'number'
    ) return null;
    return getMetersFromPlanPoints(
      { planX: position.planX, planY: position.planY },
      { planX: position.planEndX, planY: position.planEndY },
      calibration,
    );
  };

  const updatePipeGeometry = (
    photo: InspectionPhoto,
    changes: Partial<Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'>>,
  ) => {
    if (getElementType(photo) !== 'tuberia' || !hasCompletePipe(photo)) return;
    const position = {
      planX: clampPercent(changes.planX ?? photo.planX!),
      planY: clampPercent(changes.planY ?? photo.planY!),
      planEndX: clampPercent(changes.planEndX ?? photo.planEndX!),
      planEndY: clampPercent(changes.planEndY ?? photo.planEndY!),
    };
    const metraje = getCalibratedMeters(position);
    onUpdatePhotoPosition(photo.id, {
      ...position,
      ...(metraje !== null ? { metraje: roundMeters(metraje) } : {}),
    });
  };

  const saveCalibration = (event: React.FormEvent) => {
    event.preventDefault();
    if (!calibrationDraft) return;
    const referenceDistanceMeters = Number.parseFloat(calibrationMeters.replace(',', '.'));
    if (!Number.isFinite(referenceDistanceMeters) || referenceDistanceMeters <= 0) {
      setBlueprintStorageNotice('Indica una distancia conocida mayor que cero en metros.');
      return;
    }

    const calibration: BlueprintCalibration = {
      referenceDistanceMeters,
      referenceDistancePlanUnits: calibrationDraft.referenceDistancePlanUnits,
      aspectRatio: calibrationDraft.aspectRatio,
      calibratedAt: new Date().toISOString(),
    };
    setBlueprint((previous) => ({ ...previous, calibration }));

    const measurements = photos
      .filter((photo) => getElementType(photo) === 'tuberia' && hasCompletePipe(photo))
      .map((photo) => {
        const meters = getMetersFromPlanPoints(
          { planX: photo.planX!, planY: photo.planY! },
          { planX: photo.planEndX!, planY: photo.planEndY! },
          calibration,
        );
        return { id: photo.id, metraje: roundMeters(meters ?? 0) };
      });
    if (measurements.length) onUpdatePipelineMeasurements(measurements);

    setBlueprintStorageNotice(
      `Plano calibrado: ${referenceDistanceMeters.toLocaleString('es-CO', { maximumFractionDigits: 2 })} m en el tramo de referencia.`,
    );
    cancelCalibration();
  };

  const handleBlueprintUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg'].includes(file.type)) {
      setBlueprintStorageNotice('Carga un plano en formato JPG o JPEG.');
      return;
    }

    setBlueprintStorageNotice('Optimizando el plano JPG…');
    try {
      const optimizedImage = await compressImageForDevice(file, 2400, 1800, 0.86);
      setBlueprint((previous) => ({
        ...previous,
        name: file.name.replace(/\.[^/.]+$/, ''),
        imageUrl: optimizedImage,
        visible: true,
        opacity: 1,
      }));
      event.target.value = '';
    } catch {
      setBlueprintStorageNotice('No se pudo procesar el JPG. Intenta con otro archivo de plano.');
    }
  };

  const getPlanPosition = (bounds: DOMRect, clientX: number, clientY: number) => ({
    planX: clampPercent(((clientX - bounds.left) / bounds.width) * 100),
    planY: clampPercent(((clientY - bounds.top) / bounds.height) * 100),
  });

  const placeTargetAt = (target: PlacementTarget, planX: number, planY: number) => {
    if (target.stage === 'pipe-start') {
      onUpdatePhotoPosition(target.photo.id, {
        planX,
        planY,
        planEndX: undefined,
        planEndY: undefined,
      });
      setPlacement({ photo: { ...target.photo, planX, planY }, stage: 'pipe-end' });
      return;
    }

    if (target.stage === 'pipe-end') {
      const alignedEnd = alignPipeEnd(
        { planX: target.photo.planX!, planY: target.photo.planY! },
        { planX, planY },
        pipeAlignment,
      );
      const position = { planX: target.photo.planX, planY: target.photo.planY, planEndX: alignedEnd.planX, planEndY: alignedEnd.planY };
      const metraje = getCalibratedMeters(position);
      onUpdatePhotoPosition(target.photo.id, {
        planEndX: alignedEnd.planX,
        planEndY: alignedEnd.planY,
        ...(metraje !== null ? { metraje: roundMeters(metraje) } : {}),
      });
      setPlacement(null);
      return;
    }

    onUpdatePhotoPosition(target.photo.id, { planX, planY });
    setPlacement(null);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const { planX, planY } = getPlanPosition(bounds, event.clientX, event.clientY);

    if (isMultipleSelectionMode) {
      setSelectedPlanPhotoIds([]);
      return;
    }

    if (calibrationMode) {
      if (!calibrationStart) {
        setCalibrationStart({ planX, planY });
        return;
      }
      const referenceDistancePlanUnits = getPlanDistanceUnits(
        calibrationStart,
        { planX, planY },
        bounds.width / bounds.height,
      );
      if (referenceDistancePlanUnits <= 0) return;
      setCalibrationDraft({
        referenceDistancePlanUnits,
        referenceDistancePercent: getPercentDistance(calibrationStart, { planX, planY }),
        aspectRatio: bounds.width / bounds.height,
      });
      setCalibrationMode(false);
      setCalibrationStart(null);
      setCalibrationPreview(null);
      setIsCalibrationDialogOpen(true);
      return;
    }

    if (creationMode === 'camara' || creationMode === 'caja') {
      const created = onCreatePhoto(creationMode, { planX, planY });
      setActiveFilter('all');
      setSelectedPlanPhotoId(created.id);
      setCreationMode(null);
      return;
    }

    const electricalCreationType = isElectricalElementType(creationMode ?? undefined)
      ? creationMode as ElectricalElementType
      : undefined;

    if (electricalCreationType && !isElectricalCableType(electricalCreationType)) {
      const created = onCreatePhoto('electrico', { planX, planY }, undefined, electricalCreationType);
      setActivePlanLayer('electrical');
      setActiveFilter('electrico');
      setSelectedPlanPhotoId(created.id);
      setCreationMode(null);
      return;
    }

    if (isLinearCreationMode(creationMode)) {
      if (!pipeStart) {
        setPipeStart({ planX, planY });
        return;
      }
      const alignedEnd = alignPipeEnd(pipeStart, { planX, planY }, pipeAlignment);
      const isElectricalCable = Boolean(electricalCreationType && isElectricalCableType(electricalCreationType));
      const created = onCreatePhoto(isElectricalCable ? 'electrico' : 'tuberia', {
        planX: pipeStart.planX,
        planY: pipeStart.planY,
        planEndX: alignedEnd.planX,
        planEndY: alignedEnd.planY,
      }, roundMeters(getMetersFromPlanPoints(pipeStart, alignedEnd, blueprint.calibration) ?? 0), isElectricalCable ? electricalCreationType : undefined);
      setActivePlanLayer(isElectricalCable ? 'electrical' : 'civil');
      setActiveFilter(isElectricalCable ? 'electrico' : 'all');
      setSelectedPlanPhotoId(created.id);
      setPipeStart(null);
      setPipePreview(null);
      setPipeAlignment('libre');
      setCreationMode(null);
      return;
    }

    if (!placement) return;
    placeTargetAt(placement, planX, planY);
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (calibrationMode && calibrationStart) {
      setCalibrationPreview(getPlanPosition(bounds, event.clientX, event.clientY));
      return;
    }
    if (!isLinearCreationMode(creationMode) || !pipeStart) return;
    setPipePreview(alignPipeEnd(pipeStart, getPlanPosition(bounds, event.clientX, event.clientY), pipeAlignment));
  };

  const handleCanvasMouseLeave = () => {
    if (isLinearCreationMode(creationMode)) setPipePreview(null);
    if (calibrationMode) setCalibrationPreview(null);
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const activeDrag = dragTargetRef.current ?? dragTarget;
    if (!activeDrag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const { planX, planY } = getPlanPosition(bounds, event.clientX, event.clientY);
    const { photo, source } = activeDrag;
    const type = getElementType(photo);

    if (source === 'palette') {
      placeTargetAt(
        { photo, stage: type === 'tuberia' ? (isPlaced(photo) ? 'pipe-end' : 'pipe-start') : 'point' },
        planX,
        planY,
      );
    } else if (type === 'tuberia' && hasCompletePipe(photo)) {
      const midpointX = (photo.planX! + photo.planEndX!) / 2;
      const midpointY = (photo.planY! + photo.planEndY!) / 2;
      const shiftX = Math.min(100 - Math.max(photo.planX!, photo.planEndX!), Math.max(-Math.min(photo.planX!, photo.planEndX!), planX - midpointX));
      const shiftY = Math.min(100 - Math.max(photo.planY!, photo.planEndY!), Math.max(-Math.min(photo.planY!, photo.planEndY!), planY - midpointY));
      const position = {
        planX: photo.planX! + shiftX,
        planY: photo.planY! + shiftY,
        planEndX: photo.planEndX! + shiftX,
        planEndY: photo.planEndY! + shiftY,
      };
      const metraje = getCalibratedMeters(position);
      onUpdatePhotoPosition(photo.id, {
        ...position,
        ...(metraje !== null ? { metraje: roundMeters(metraje) } : {}),
      });
    } else {
      onUpdatePhotoPosition(photo.id, { planX, planY });
    }
    dragTargetRef.current = null;
    setDragTarget(null);
  };

  const startDragging = (event: React.DragEvent<HTMLElement>, photo: InspectionPhoto, source: DragTarget['source']) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', photo.id);
    const target = { photo, source } satisfies DragTarget;
    dragTargetRef.current = target;
    setDragTarget(target);
  };

  const planScale = clampScale(Number(blueprint.scale) || 1, 0.6, 1.8);
  const adjustPlanScale = (difference: number) => {
    setBlueprint((previous) => ({
      ...previous,
      scale: clampScale((Number(previous.scale) || 1) + difference, 0.6, 1.8),
    }));
  };
  const adjustIconScale = (difference: number) => {
    setIconScale((previous) => clampScale(previous + difference, 0.4, 1.8));
  };
  const adjustTextScale = (difference: number) => {
    setTextScale((previous) => clampScale(previous + difference, 0.5, 1.8));
  };

  const pipePreviewDistance = useMemo(() => {
    if (!pipeStart || !pipePreview) return null;
    return getPercentDistance(pipeStart, pipePreview);
  }, [pipePreview, pipeStart]);

  const pipePreviewMeters = useMemo(() => {
    if (!pipeStart || !pipePreview) return null;
    return getMetersFromPlanPoints(pipeStart, pipePreview, blueprint.calibration);
  }, [blueprint.calibration, pipePreview, pipeStart]);

  const pipePreviewMidpoint = pipeStart && pipePreview
    ? { planX: (pipeStart.planX + pipePreview.planX) / 2, planY: (pipeStart.planY + pipePreview.planY) / 2 }
    : null;

  const calibrationPreviewDistance = calibrationStart && calibrationPreview
    ? getPercentDistance(calibrationStart, calibrationPreview)
    : null;
  const calibrationPreviewMidpoint = calibrationStart && calibrationPreview
    ? { planX: (calibrationStart.planX + calibrationPreview.planX) / 2, planY: (calibrationStart.planY + calibrationPreview.planY) / 2 }
    : null;

  const activeElectricalCreationType = isElectricalElementType(creationMode ?? undefined)
    ? creationMode as ElectricalElementType
    : undefined;

  const placementInstruction = calibrationMode
    ? calibrationStart
      ? 'Marca el final de un tramo cuya distancia real conozcas.'
      : 'Marca el inicio de un tramo con distancia conocida para calibrar el plano.'
    : creationMode === 'camara'
    ? 'Haz clic sobre el plano para agregar una nueva cámara.'
    : creationMode === 'caja'
      ? 'Haz clic sobre el plano para agregar una nueva caja.'
    : activeElectricalCreationType && !isElectricalCableType(activeElectricalCreationType)
      ? `Haz clic sobre el plano para agregar ${getElectricalElementOption(activeElectricalCreationType).label.toLowerCase()}.`
    : isLinearCreationMode(creationMode)
      ? pipeStart
        ? `Haz clic para definir el final de ${activeElectricalCreationType ? getElectricalElementOption(activeElectricalCreationType).label.toLowerCase() : 'el nuevo tramo'}. Guía actual: ${pipePreviewMeters !== null ? `${pipePreviewMeters.toFixed(2)} m` : `${pipePreviewDistance?.toFixed(1) ?? '0.0'}% del plano`}.`
        : `Haz clic para definir el inicio de ${activeElectricalCreationType ? getElectricalElementOption(activeElectricalCreationType).label.toLowerCase() : 'un nuevo tramo de tubería'}.`
      : placement
    ? placement.stage === 'pipe-start'
      ? `Haz clic para ubicar el inicio de ${elementLabel(placement.photo)}.`
      : placement.stage === 'pipe-end'
        ? `Haz clic para ubicar el final de ${elementLabel(placement.photo)}.`
        : `Haz clic para ubicar ${elementLabel(placement.photo)}.`
    : null;

  return (
    <section
      className={`relative h-full w-full overflow-hidden bg-[#e7edf1] font-['Roboto',sans-serif] ${
        isFullscreen ? 'fixed inset-0 z-50 bg-[#e7edf1]' : ''
      }`}
    >
      {blueprintStorageNotice && (
        <div className="absolute right-4 top-20 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 shadow-lg">
          <span className="material-symbols-outlined mt-0.5 text-[17px] text-amber-700">info</span>
          <span className="flex-1">{blueprintStorageNotice}</span>
          <button type="button" onClick={() => setBlueprintStorageNotice(null)} aria-label="Cerrar aviso">
            <span className="material-symbols-outlined text-[17px]">close</span>
          </button>
        </div>
      )}

      <header className="absolute inset-x-0 top-0 z-30 flex flex-col gap-3 border-b border-[#c7d7df] bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#073f74] text-white shadow-sm">
            <span className="material-symbols-outlined text-[21px]">architecture</span>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#527284]">PLANO / UBICACIÓN MANUAL</p>
            <h1 className="truncate text-sm font-bold text-[#0b2940]">{blueprint.imageUrl ? blueprint.name : 'Carga un plano JPG para comenzar'}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:flex-none">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#5d7887]">search</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar elementos…"
              className="h-9 w-full rounded-lg border border-[#c7d7df] bg-white py-1 pl-9 pr-3 text-xs text-[#0b2940] outline-none transition focus:border-[#0566aa] focus:ring-2 focus:ring-[#0566aa]/15"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsPanelOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#b4cbd8] bg-white px-3 text-xs font-semibold text-[#154860] transition hover:bg-[#eaf6fb]"
          >
            <span className="material-symbols-outlined text-[17px]">format_list_bulleted</span>
            Ubicar ({pendingPhotos.length})
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0566aa] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#004d84]"
          >
            <span className="material-symbols-outlined text-[17px]">upload_file</span>
            {blueprint.imageUrl ? 'Cambiar JPG' : 'Cargar JPG'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,.jpg,.jpeg" onChange={handleBlueprintUpload} className="hidden" />
        </div>
      </header>

      <div className="absolute left-4 top-[78px] z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
        {([
          ['all', 'Todos', 'layers'],
          ['camara', 'Cámaras', 'videocam'],
          ['caja', 'Cajas', 'inventory_2'],
          ['tuberia', 'Tuberías', 'timeline'],
          ['electrico', 'Eléctricos', 'bolt'],
          ['pending', 'Sin ubicar', 'location_off'],
        ] as const).map(([filter, label, icon]) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
              activeFilter === filter
                ? 'border-[#0566aa] bg-[#e5f4fb] text-[#004d84]'
                : 'border-[#c7d7df] bg-white text-[#466473] hover:bg-[#f4fafc]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{icon}</span>
            {label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-[#b8ced9] sm:block" aria-hidden="true" />
        {([
          ['all', 'Todas las capas', 'layers'],
          ['civil', 'Obras civiles', 'architecture'],
          ['electrical', 'Obras eléctricas', 'bolt'],
        ] as const).map(([layer, label, icon]) => (
          <button
            key={layer}
            type="button"
            onClick={() => setActivePlanLayer(layer)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
              activePlanLayer === layer
                ? layer === 'electrical'
                  ? 'border-[#7c3aed] bg-[#f3edff] text-[#5b21b6]'
                  : 'border-[#0566aa] bg-[#e5f4fb] text-[#004d84]'
                : 'border-[#c7d7df] bg-white text-[#466473] hover:bg-[#f4fafc]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{icon}</span>
            {label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-[#b8ced9] sm:block" aria-hidden="true" />
        <button
          type="button"
          onClick={() => activateCreation('caja')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            creationMode === 'caja'
              ? 'border-[#b77812] bg-[#b77812] text-white'
              : 'border-[#e0bf78] bg-white text-[#8b5d05] hover:bg-[#fff6df]'
          }`}
          title="Agregar caja directamente al plano"
        >
          <span className="material-symbols-outlined text-[16px]">inventory_2</span>
          Caja
        </button>
        <button
          type="button"
          onClick={() => activateCreation('camara')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            creationMode === 'camara'
              ? 'border-[#0566aa] bg-[#0566aa] text-white'
              : 'border-[#8ec6dd] bg-white text-[#075a91] hover:bg-[#e5f4fb]'
          }`}
          title="Agregar cámara directamente al plano"
        >
          <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
          Cámara
        </button>
        <button
          type="button"
          onClick={() => activateCreation('tuberia')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            creationMode === 'tuberia'
              ? 'border-[#073f74] bg-[#073f74] text-white'
              : 'border-[#9fb5c5] bg-white text-[#173f58] hover:bg-[#eaf3f8]'
          }`}
          title="Agregar tramo de tubería directamente al plano"
        >
          <span className="material-symbols-outlined text-[16px]">timeline</span>
          Tubería
        </button>
        <span className="mx-1 hidden h-6 w-px bg-[#b8ced9] sm:block" aria-hidden="true" />
        {ELECTRICAL_ELEMENT_OPTIONS.map((element) => (
          <button
            key={element.value}
            type="button"
            onClick={() => activateCreation(element.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
              creationMode === element.value
                ? 'border-[#5b21b6] bg-[#5b21b6] text-white'
                : 'border-[#d8c3fb] bg-white text-[#5b21b6] hover:bg-[#f5f0ff]'
            }`}
            title={`Agregar ${element.label.toLowerCase()} a Obras Eléctricas`}
          >
            <span className="material-symbols-outlined text-[16px]">{element.icon}</span>
            {element.shortLabel}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleMultipleSelectionMode}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            isMultipleSelectionMode
              ? 'border-[#073f74] bg-[#073f74] text-white'
              : 'border-[#9fb5c5] bg-white text-[#173f58] hover:bg-[#eaf3f8]'
          }`}
          title="Seleccionar varios elementos para eliminarlos juntos"
          aria-pressed={isMultipleSelectionMode}
        >
          <span className="material-symbols-outlined text-[16px]">select_all</span>
          Selección
        </button>
        <button
          type="button"
          onClick={() => setAreActaLabelsVisible((visible) => !visible)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            areActaLabelsVisible
              ? 'border-[#0b5d8c] bg-white text-[#075a91] hover:bg-[#e5f4fb]'
              : 'border-[#afc0c9] bg-[#eef3f5] text-[#58717d] hover:bg-white'
          }`}
          title={areActaLabelsVisible ? 'Ocultar todos los rótulos de acta' : 'Mostrar todos los rótulos de acta'}
          aria-pressed={areActaLabelsVisible}
        >
          <span className="material-symbols-outlined text-[16px]">{areActaLabelsVisible ? 'visibility' : 'visibility_off'}</span>
          Actas
        </button>
        <button
          type="button"
          onClick={() => setAreCameraNamesVisible((visible) => !visible)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm transition ${
            areCameraNamesVisible
              ? 'border-[#0b5d8c] bg-white text-[#075a91] hover:bg-[#e5f4fb]'
              : 'border-[#afc0c9] bg-[#eef3f5] text-[#58717d] hover:bg-white'
          }`}
          title={areCameraNamesVisible ? 'Ocultar nombres de cámaras' : 'Mostrar nombres de cámaras'}
          aria-pressed={areCameraNamesVisible}
        >
          <span className="material-symbols-outlined text-[16px]">{areCameraNamesVisible ? 'visibility' : 'visibility_off'}</span>
          Nombres
        </button>
      </div>

      <main className="absolute inset-x-0 bottom-0 top-[62px] overflow-auto p-5 pt-16">
        {blueprint.imageUrl ? (
          <div className="flex min-h-full min-w-full items-center justify-center py-3">
            <div
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={handleCanvasDrop}
              className={`relative inline-flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-3rem)] overflow-hidden border border-[#9dbbc9] bg-white shadow-[0_18px_46px_rgba(7,63,116,0.22)] transition-transform duration-200 ${
                placement || creationMode ? 'cursor-crosshair' : dragTarget ? 'ring-2 ring-[#18a9cf] ring-offset-2' : 'cursor-default'
              }`}
              style={{ transform: `scale(${planScale})` }}
              aria-label="Plano interactivo de inspección"
            >
              <img
                src={blueprint.imageUrl}
                alt={blueprint.name}
                className="block max-h-[calc(100vh-10rem)] max-w-[calc(100vw-3rem)] object-contain"
                draggable={false}
              />

            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="plan-mt" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0d9fc6" />
                  <stop offset="100%" stopColor="#004d84" />
                </linearGradient>
                <linearGradient id="plan-bt" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
              {positionedPhotos.map((photo) => {
                if (!isLinearPlanElement(photo) || !hasCompletePipe(photo)) return null;
                const electricalOption = getElectricalElementOption(photo.electricalType);
                const pipeStroke = isElectricalPhoto(photo)
                  ? photo.electricalColor || electricalOption.color
                  : photo.pipeColor || getPipeNetworkOption(photo.pipeNetworkType).color;
                const isSelected = !isMultipleSelectionMode && selectedPlanPhotoId === photo.id;
                return (
                  <g key={`line-${photo.id}`}>
                    <line x1={photo.planX} y1={photo.planY} x2={photo.planEndX} y2={photo.planEndY} stroke="rgba(255,255,255,0.82)" strokeWidth="2.2" strokeLinecap="round" />
                    <line x1={photo.planX} y1={photo.planY} x2={photo.planEndX} y2={photo.planEndY} stroke={pipeStroke} strokeWidth="1.1" strokeLinecap="round" strokeDasharray={photo.electricalType === 'cable_datos' ? '2.2 1.2' : undefined} />
                    {isSelected && (
                      <>
                        <circle cx={photo.planX} cy={photo.planY} r="1.55" fill="#ffffff" stroke="#073f74" strokeWidth="0.7" />
                        <circle cx={photo.planEndX} cy={photo.planEndY} r="1.55" fill="#ffffff" stroke="#073f74" strokeWidth="0.7" />
                      </>
                    )}
                  </g>
                );
              })}
              {isLinearCreationMode(creationMode) && pipeStart && (
                <>
                  {pipePreview && (
                    <>
                      <line x1={pipeStart.planX} y1={pipeStart.planY} x2={pipePreview.planX} y2={pipePreview.planY} stroke="rgba(255,255,255,0.92)" strokeWidth="2.8" strokeLinecap="round" />
                      <line x1={pipeStart.planX} y1={pipeStart.planY} x2={pipePreview.planX} y2={pipePreview.planY} stroke={activeElectricalCreationType ? getElectricalElementOption(activeElectricalCreationType).color : '#073f74'} strokeWidth="1.3" strokeDasharray="2.2 1.4" strokeLinecap="round" />
                      <circle cx={pipePreview.planX} cy={pipePreview.planY} r="1.25" fill="#eab308" stroke="white" strokeWidth="0.65" />
                    </>
                  )}
                  <circle cx={pipeStart.planX} cy={pipeStart.planY} r="1.6" fill={activeElectricalCreationType ? getElectricalElementOption(activeElectricalCreationType).color : '#073f74'} stroke="white" strokeWidth="0.7" />
                </>
              )}
              {calibrationMode && calibrationStart && (
                <>
                  {calibrationPreview && (
                    <>
                      <line x1={calibrationStart.planX} y1={calibrationStart.planY} x2={calibrationPreview.planX} y2={calibrationPreview.planY} stroke="rgba(255,255,255,0.95)" strokeWidth="3" strokeLinecap="round" />
                      <line x1={calibrationStart.planX} y1={calibrationStart.planY} x2={calibrationPreview.planX} y2={calibrationPreview.planY} stroke="#eab308" strokeWidth="1.4" strokeDasharray="1.8 1.2" strokeLinecap="round" />
                      <circle cx={calibrationPreview.planX} cy={calibrationPreview.planY} r="1.25" fill="#eab308" stroke="white" strokeWidth="0.65" />
                    </>
                  )}
                  <circle cx={calibrationStart.planX} cy={calibrationStart.planY} r="1.6" fill="#eab308" stroke="white" strokeWidth="0.7" />
                </>
              )}
            </svg>

            {pipePreviewDistance !== null && pipePreviewMidpoint && (
              <div
                className="pointer-events-none absolute z-20 rounded-full border border-[#f8d878] bg-[#0b2940]/95 px-2.5 py-1 font-mono text-[10px] font-bold text-white shadow-lg"
                style={{ left: `${pipePreviewMidpoint.planX}%`, top: `${pipePreviewMidpoint.planY}%`, transform: `translate(-50%, -50%) scale(${textScale})`, transformOrigin: 'center' }}
              >
                ↔ {pipePreviewDistance.toFixed(1)}% del plano
              </div>
            )}

            {pipePreviewMeters !== null && pipePreviewMidpoint && (
              <div
                className="pointer-events-none absolute z-20 rounded-full border border-cyan-300 bg-[#0566aa]/95 px-2.5 py-1 font-mono text-[10px] font-bold text-white shadow-lg"
                style={{ left: `${pipePreviewMidpoint.planX}%`, top: `${pipePreviewMidpoint.planY}%`, transform: `translate(-50%, calc(-50% + 16px)) scale(${textScale})`, transformOrigin: 'center' }}
              >
                ↔ {pipePreviewMeters.toFixed(2)} m
              </div>
            )}

            {calibrationPreviewDistance !== null && calibrationPreviewMidpoint && (
              <div
                className="pointer-events-none absolute z-20 rounded-full border border-[#f8d878] bg-[#0b2940]/95 px-2.5 py-1 font-mono text-[10px] font-bold text-white shadow-lg"
                style={{ left: `${calibrationPreviewMidpoint.planX}%`, top: `${calibrationPreviewMidpoint.planY}%`, transform: `translate(-50%, -50%) scale(${textScale})`, transformOrigin: 'center' }}
              >
                REF. {calibrationPreviewDistance.toFixed(1)}% del plano
              </div>
            )}

            {positionedPhotos.map((photo) => {
              const type = getElementType(photo);
              const electrical = isElectricalPhoto(photo);
              const electricalOption = getElectricalElementOption(photo.electricalType);
              if (isLinearPlanElement(photo)) {
                if (!hasCompletePipe(photo)) return null;
                const midpointX = (photo.planX! + photo.planEndX!) / 2;
                const midpointY = (photo.planY! + photo.planEndY!) / 2;
                const actaName = photo.acta?.trim();
                return (
                  <React.Fragment key={photo.id}>
                    <button
                      type="button"
                      draggable={!placement && !isMultipleSelectionMode}
                      onDragStart={(event) => startDragging(event, photo, 'plan')}
                      onDragEnd={() => {
                        dragTargetRef.current = null;
                        setDragTarget(null);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (placement || creationMode) return;
                        if (isMultipleSelectionMode) {
                          togglePlanPhotoSelection(photo.id);
                        } else {
                          setSelectedPlanPhotoId(photo.id);
                        }
                      }}
                      style={{ left: `${midpointX}%`, top: `${midpointY}%`, backgroundColor: electrical ? photo.electricalColor || electricalOption.color : '#073f74', transform: `translate(-50%, -50%) scale(${iconScale})` }}
                      className={`absolute z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition hover:scale-110 active:cursor-grabbing ${placement || creationMode ? 'pointer-events-none' : isMultipleSelectionMode ? 'cursor-pointer' : 'cursor-grab'} ${(isMultipleSelectionMode ? selectedPlanPhotoIds.includes(photo.id) : selectedPlanPhotoId === photo.id) ? 'ring-4 ring-cyan-300 ring-offset-2' : ''}`}
                      title={isMultipleSelectionMode ? `Seleccionar ${elementLabel(photo)}` : `Abrir o mover ${elementLabel(photo)}`}
                      aria-label={isMultipleSelectionMode ? `Seleccionar ${elementLabel(photo)}` : `Abrir o mover ${elementLabel(photo)}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{electrical ? electricalOption.icon : 'timeline'}</span>
                    </button>
                    {actaName && areActaLabelsVisible && photo.showActaLabel !== false && (
                      <span
                        className="pointer-events-none absolute z-20 flex max-w-[150px] items-center gap-1 whitespace-nowrap rounded-md border border-[#0b5d8c]/35 bg-white/95 px-1.5 py-1 font-mono text-[9px] font-bold text-[#0b4770] shadow-[0_3px_10px_rgba(7,63,116,0.24)]"
                        style={getActaLabelStyle(midpointX, midpointY, photo.actaLabelPosition, 4 + iconScale * 16, textScale)}
                        title={actaName}
                      >
                        <span className="material-symbols-outlined text-[13px]">assignment</span>
                        <span className="truncate">{actaName}</span>
                      </span>
                    )}
                  </React.Fragment>
                );
              }

              const isCamera = type === 'camara';
              const markerColor = electrical
                ? photo.electricalColor || electricalOption.color
                : !isCamera
                  ? '#b77812'
                : photo.cameraType === 'BT'
                  ? '#b94324'
                  : photo.cameraType === 'Datos'
                    ? '#f97316'
                    : '#0566aa';
              const actaName = photo.acta?.trim();
              const cameraName = isCamera ? cameraNameLabel(photo) : null;
              return (
                <React.Fragment key={photo.id}>
                  <button
                    type="button"
                    draggable={!placement && !isMultipleSelectionMode}
                    onDragStart={(event) => startDragging(event, photo, 'plan')}
                    onDragEnd={() => {
                      dragTargetRef.current = null;
                      setDragTarget(null);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (placement || creationMode) return;
                      if (isMultipleSelectionMode) {
                        togglePlanPhotoSelection(photo.id);
                      } else {
                        setSelectedPlanPhotoId(photo.id);
                      }
                    }}
                    style={{ left: `${photo.planX}%`, top: `${photo.planY}%`, backgroundColor: markerColor, transform: `translate(-50%, -50%) scale(${iconScale})` }}
                    className={`absolute z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_3px_10px_rgba(6,36,58,0.35)] transition hover:scale-110 active:cursor-grabbing ${placement || creationMode ? 'pointer-events-none' : isMultipleSelectionMode ? 'cursor-pointer' : 'cursor-grab'} ${(isMultipleSelectionMode ? selectedPlanPhotoIds.includes(photo.id) : selectedPlanPhotoId === photo.id) ? 'ring-4 ring-cyan-300 ring-offset-2' : ''}`}
                    title={isMultipleSelectionMode ? `Seleccionar ${elementLabel(photo)}` : `Abrir o mover ${elementLabel(photo)}`}
                    aria-label={isMultipleSelectionMode ? `Seleccionar ${elementLabel(photo)}` : `Abrir o mover ${elementLabel(photo)}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{electrical ? electricalOption.icon : isCamera ? 'videocam' : 'inventory_2'}</span>
                  </button>
                  {cameraName && areCameraNamesVisible && (
                    <span
                      className="pointer-events-none absolute z-20 max-w-[160px] truncate rounded-md border border-[#0566aa]/35 bg-white/95 px-1.5 py-1 font-mono text-[9px] font-bold text-[#075a91] shadow-[0_3px_10px_rgba(6,36,58,0.24)]"
                      style={getCameraNameStyle(photo.planX!, photo.planY!, 5 + iconScale * 18, textScale)}
                      title={cameraName}
                    >
                      {cameraName}
                    </span>
                  )}
                  {actaName && areActaLabelsVisible && photo.showActaLabel !== false && (
                    <span
                      className="pointer-events-none absolute z-20 flex max-w-[150px] items-center gap-1 whitespace-nowrap rounded-md border border-[#0b5d8c]/35 bg-white/95 px-1.5 py-1 font-mono text-[9px] font-bold text-[#0b4770] shadow-[0_3px_10px_rgba(6,36,58,0.24)]"
                      style={getActaLabelStyle(photo.planX!, photo.planY!, photo.actaLabelPosition, 4 + iconScale * 18, textScale)}
                      title={actaName}
                    >
                      <span className="material-symbols-outlined text-[13px]">assignment</span>
                      <span className="truncate">{actaName}</span>
                    </span>
                  )}
                </React.Fragment>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="max-w-lg rounded-2xl border border-dashed border-[#8bb5c9] bg-white p-8 text-center shadow-[0_14px_34px_rgba(7,63,116,0.12)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e4f4fb] text-[#0566aa]">
              <span className="material-symbols-outlined text-[30px]">upload_file</span>
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#0b2940]">Carga el plano JPG de la obra</h2>
            <p className="mt-2 text-sm leading-6 text-[#547181]">El plano se ajustará automáticamente a la pantalla. Después podrás seleccionar un elemento pendiente y hacer clic exactamente donde debe quedar ubicado.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0566aa] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#004d84]">
              <span className="material-symbols-outlined text-[19px]">add_photo_alternate</span>
              Seleccionar JPG
            </button>
          </div>
        )}
      </main>

      {isMultipleSelectionMode && !placementInstruction && (
        <aside className="absolute right-4 top-[138px] z-30 w-[min(88vw,320px)] border border-[#729bad] bg-white/95 p-3 shadow-[0_14px_32px_rgba(7,63,116,0.2)] backdrop-blur">
          <div className="flex items-start justify-between gap-3 border-b border-[#d3e1e8] pb-2">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[0.14em] text-[#0b5d8c]">SELECCIÓN MÚLTIPLE</p>
              <p className="mt-0.5 text-sm font-bold text-[#0b2940]">{selectedMultiplePlanPhotos.length} elemento{selectedMultiplePlanPhotos.length === 1 ? '' : 's'} seleccionado{selectedMultiplePlanPhotos.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={exitMultipleSelection} className="text-[#527284] transition hover:text-[#0b2940]" aria-label="Salir de la selección múltiple">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#547181]">Haz clic en los iconos para incluirlos o quitarlos de la selección. Haz clic en una zona vacía para limpiar la selección.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setSelectedPlanPhotoIds([])} disabled={!selectedMultiplePlanPhotos.length} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 border border-[#b4cbd8] bg-white px-3 text-xs font-bold text-[#315c70] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-40">Limpiar</button>
            <button type="button" onClick={() => setPhotosPendingDeletion(selectedMultiplePlanPhotos)} disabled={!selectedMultiplePlanPhotos.length} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-[#b42318] px-3 text-xs font-bold text-white transition hover:bg-[#8d1b13] disabled:cursor-not-allowed disabled:opacity-40">
              <span className="material-symbols-outlined text-[16px]">delete</span>
              Eliminar ({selectedMultiplePlanPhotos.length})
            </button>
          </div>
        </aside>
      )}

      {selectedPlanPhoto && !placementInstruction && !isMultipleSelectionMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-transparent"
            onClick={() => setSelectedPlanPhotoId(null)}
            aria-label="Cerrar propiedades del elemento"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-element-title"
            className="relative z-10 flex max-h-[min(86vh,720px)] w-full max-w-lg flex-col overflow-hidden border border-[#8eb4c7] bg-white shadow-[0_24px_72px_rgba(7,63,116,0.34)]"
          >
          <div className="flex items-start justify-between gap-3 border-b border-[#d3e1e8] bg-[#f4fbfe] px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold tracking-[0.14em] text-[#527284]">ELEMENTO SELECCIONADO</p>
              <h2 id="selected-element-title" className="mt-0.5 truncate text-lg font-bold text-[#0b2940]">{elementLabel(selectedPlanPhoto)}</h2>
            </div>
            <button type="button" onClick={() => setSelectedPlanPhotoId(null)} className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#b4cbd8] bg-white text-[#315c70] transition hover:bg-[#eaf6fb]" aria-label="Cerrar propiedades del elemento">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">
          {getElementType(selectedPlanPhoto) === 'tuberia' && (
            <>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-[#b7d5e4] bg-[#eaf6fb] px-2.5 py-2">
                <span className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#527284]">LONGITUD {blueprint.calibration ? 'CALIBRADA' : 'REGISTRADA'}</span>
                <span className="font-mono text-sm font-bold text-[#0b5d8c]">{Number.parseFloat(String(selectedPlanPhoto.metraje ?? 0)).toFixed(2)} m</span>
              </div>
              <div className="mt-3 border border-[#b7d5e4] bg-white p-2.5">
                <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#0b5d8c]">TIPO DE RED</p>
                <p className="mt-0.5 text-[10px] text-[#547181]">La red aplica un color automático al tramo.</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {PIPE_NETWORK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onUpdatePhoto({
                        ...selectedPlanPhoto,
                        pipeNetworkType: option.value as PipeNetworkType,
                        pipeColor: option.color,
                      })}
                      className={`flex min-h-12 flex-col items-center justify-center gap-1 border px-1 text-[9px] font-bold transition hover:bg-[#f4fbfe] ${
                        selectedPlanPhoto.pipeNetworkType === option.value
                          ? 'border-[#073f74] bg-[#f4fbfe] text-[#073f74] ring-1 ring-cyan-300'
                          : 'border-[#c7dce7] bg-white text-[#547181]'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 border border-[#b7d5e4] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#0b5d8c]">COLOR DEL TRAMO</p>
                    <p className="mt-0.5 text-[10px] text-[#547181]">Puedes ajustar el color automático cuando necesites una convención particular.</p>
                  </div>
                  <label className="relative flex h-9 w-12 shrink-0 cursor-pointer overflow-hidden border-2 border-white shadow-[0_0_0_1px_#8bb5c9]" title="Elegir color personalizado">
                    <input
                      type="color"
                      value={selectedPlanPhoto.pipeColor || '#0d9fc6'}
                      onChange={(event) => onUpdatePhoto({ ...selectedPlanPhoto, pipeColor: event.currentTarget.value.toUpperCase() })}
                      className="absolute -inset-2 h-16 w-16 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Elegir color del tramo"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['#0D9FC6', '#0566AA', '#16A34A', '#EAB308', '#EA580C', '#DC2626', '#7C3AED', '#1F2937'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onUpdatePhoto({ ...selectedPlanPhoto, pipeColor: color })}
                      className={`h-6 w-6 border-2 transition hover:scale-110 ${selectedPlanPhoto.pipeColor?.toUpperCase() === color ? 'border-[#073f74] ring-2 ring-cyan-300 ring-offset-1' : 'border-white shadow-[0_0_0_1px_#b4cbd8]'}`}
                      style={{ backgroundColor: color }}
                      title={`Asignar color ${color}`}
                      aria-label={`Asignar color ${color}`}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 border border-[#b7d5e4] bg-[#f7fcfe] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#0b5d8c]">AJUSTE PRECISO · % DEL PLANO</p>
                  <span className="material-symbols-outlined text-[16px] text-[#075a91]">tune</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-[#547181]">Edita los extremos con precisión de 0,01%. Los puntos blancos del tramo indican inicio y final.</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    ['Inicio X', 'planX'],
                    ['Inicio Y', 'planY'],
                    ['Final X', 'planEndX'],
                    ['Final Y', 'planEndY'],
                  ] as const).map(([label, key]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block font-mono text-[8px] font-bold tracking-[0.08em] text-[#547181]">{label}</span>
                      <input
                        key={`${selectedPlanPhoto.id}-${key}-${selectedPlanPhoto[key]}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={Number(selectedPlanPhoto[key] ?? 0).toFixed(2)}
                        onBlur={(event) => {
                          const value = Number.parseFloat(event.currentTarget.value);
                          if (Number.isFinite(value)) updatePipeGeometry(selectedPlanPhoto, { [key]: value });
                        }}
                        className="h-8 w-full border border-[#b4cbd8] bg-white px-2 font-mono text-[11px] font-bold text-[#173f58] outline-none transition focus:border-[#0566aa] focus:ring-2 focus:ring-[#0566aa]/15"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => updatePipeGeometry(selectedPlanPhoto, { planEndY: selectedPlanPhoto.planY })} className="h-8 border border-[#9ec7d8] bg-white px-1 text-[10px] font-bold text-[#075a91] transition hover:bg-[#eaf6fb]">Horizontal</button>
                  <button type="button" onClick={() => updatePipeGeometry(selectedPlanPhoto, { planEndX: selectedPlanPhoto.planX })} className="h-8 border border-[#9ec7d8] bg-white px-1 text-[10px] font-bold text-[#075a91] transition hover:bg-[#eaf6fb]">Vertical</button>
                  <button type="button" onClick={() => {
                    const distance = Math.max(Math.abs(selectedPlanPhoto.planEndX! - selectedPlanPhoto.planX!), Math.abs(selectedPlanPhoto.planEndY! - selectedPlanPhoto.planY!));
                    updatePipeGeometry(selectedPlanPhoto, {
                      planEndX: selectedPlanPhoto.planX! + Math.sign(selectedPlanPhoto.planEndX! - selectedPlanPhoto.planX! || 1) * distance,
                      planEndY: selectedPlanPhoto.planY! + Math.sign(selectedPlanPhoto.planEndY! - selectedPlanPhoto.planY! || 1) * distance,
                    });
                  }} className="h-8 border border-[#9ec7d8] bg-white px-1 text-[10px] font-bold text-[#075a91] transition hover:bg-[#eaf6fb]">45°</button>
                </div>
              </div>
            </>
          )}
          {selectedPlanPhoto.acta?.trim() && (
            <div className="mt-3 flex items-center justify-between gap-3 border border-[#b7d5e4] bg-[#f4fbfe] px-2.5 py-2">
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#527284]">RÓTULO DE ACTA</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-[#0b4770]">{selectedPlanPhoto.acta}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={selectedPlanPhoto.showActaLabel !== false}
                onClick={() => onUpdatePhoto({ ...selectedPlanPhoto, showActaLabel: selectedPlanPhoto.showActaLabel === false })}
                className={`inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-bold transition ${selectedPlanPhoto.showActaLabel !== false ? 'border-[#80c7de] bg-white text-[#075a91] hover:bg-[#e6f6ff]' : 'border-[#b9cbd3] bg-[#f2f6f8] text-[#5b6f7a] hover:bg-white'}`}
                title={selectedPlanPhoto.showActaLabel !== false ? 'Ocultar rótulo de acta en el plano' : 'Mostrar rótulo de acta en el plano'}
              >
                <span className="material-symbols-outlined text-[16px]">{selectedPlanPhoto.showActaLabel !== false ? 'visibility' : 'visibility_off'}</span>
                {selectedPlanPhoto.showActaLabel !== false ? 'Visible' : 'Oculto'}
              </button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-[#d3e1e8] pt-4">
            <button type="button" onClick={() => onEditPhoto(selectedPlanPhoto)} className="inline-flex h-9 items-center justify-center gap-1.5 bg-[#0566aa] px-3 text-xs font-bold text-white transition hover:bg-[#004d84]">
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Propiedades
            </button>
            <button type="button" onClick={() => onSelectPhoto(selectedPlanPhoto)} className="inline-flex h-9 items-center justify-center gap-1.5 border border-[#b4cbd8] bg-white px-3 text-xs font-bold text-[#154860] transition hover:bg-[#eaf6fb]">
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              Detalle
            </button>
            <button
              type="button"
              onClick={() => setPhotosPendingDeletion([selectedPlanPhoto])}
              className="inline-flex h-9 w-9 items-center justify-center border border-[#f0b4b0] bg-[#fff7f6] text-[#b42318] transition hover:bg-[#ffdad6]"
              title="Eliminar elemento"
              aria-label={`Eliminar ${elementLabel(selectedPlanPhoto)}`}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
          </div>
        </aside>
        </div>
      )}

      {photosPendingDeletion.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-element-title" className="w-full max-w-md border border-[#e4aaa5] bg-white shadow-[0_20px_60px_rgba(105,35,29,0.32)]">
            <div className="flex items-start gap-3 border-b border-[#f2d0cd] bg-[#fff5f4] px-5 py-4">
              <span className="material-symbols-outlined mt-0.5 text-[24px] text-[#b42318]">warning</span>
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#8c2f27]">ELIMINAR DEL PLANO</p>
                <h2 id="delete-element-title" className="mt-1 text-lg font-bold text-[#4a1714]">¿Eliminar {photosPendingDeletion.length === 1 ? 'este elemento' : 'estos elementos'}?</h2>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm leading-6 text-[#5d3c39]">
                {photosPendingDeletion.length === 1 ? (
                  <>Se eliminará <strong>{elementLabel(photosPendingDeletion[0])}</strong> del plano y de su registro de inspección.</>
                ) : (
                  <>Se eliminarán <strong>{photosPendingDeletion.length} elementos</strong> del plano y de sus registros de inspección.</>
                )} Esta acción no se puede deshacer.
              </p>
              <div className="rounded-lg border border-[#f0d2cf] bg-[#fff9f8] px-3 py-2 font-mono text-[10px] font-bold tracking-[0.1em] text-[#8c2f27]">
                {photosPendingDeletion.length === 1
                  ? `${getElementType(photosPendingDeletion[0]).toUpperCase()} · REGISTRO ${photosPendingDeletion[0].displayId || photosPendingDeletion[0].id}`
                  : `${photosPendingDeletion.map((photo) => elementLabel(photo)).slice(0, 3).join(' · ')}${photosPendingDeletion.length > 3 ? ` · +${photosPendingDeletion.length - 3}` : ''}`}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#f2d0cd] px-5 py-4">
              <button type="button" onClick={() => setPhotosPendingDeletion([])} className="h-9 border border-[#b4cbd8] bg-white px-3 text-xs font-bold text-[#315c70] transition hover:bg-[#eaf6fb]">Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  onDeletePhotos(photosPendingDeletion.map((photo) => photo.id));
                  setPhotosPendingDeletion([]);
                  setSelectedPlanPhotoId(null);
                  exitMultipleSelection();
                }}
                className="inline-flex h-9 items-center gap-1.5 bg-[#b42318] px-3 text-xs font-bold text-white transition hover:bg-[#8d1b13]"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Eliminar {photosPendingDeletion.length === 1 ? 'elemento' : `(${photosPendingDeletion.length})`}
              </button>
            </div>
          </section>
        </div>
      )}

      {isCalibrationDialogOpen && calibrationDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={saveCalibration} className="w-full max-w-md border border-[#9dbbc9] bg-white shadow-[0_20px_60px_rgba(7,63,116,0.32)]">
            <div className="flex items-start justify-between border-b border-[#d3e1e8] bg-[#eaf6fb] px-5 py-4">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#527284]">ESCALA DEL PLANO</p>
                <h2 className="mt-1 text-lg font-bold text-[#0b2940]">Calibrar distancia real</h2>
              </div>
              <button type="button" onClick={cancelCalibration} aria-label="Cancelar calibración" className="text-[#527284] transition hover:text-[#0b2940]">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="border-l-4 border-[#eab308] bg-[#fff9e8] px-3 py-2.5 text-xs leading-5 text-[#684e08]">
                Marcaste una referencia de <strong>{calibrationDraft.referenceDistancePercent.toFixed(1)}% del plano</strong>. Indica cuántos metros reales representa ese tramo.
              </div>
              <div>
                <label htmlFor="calibration-meters" className="mb-1.5 block text-xs font-bold text-[#0b2940]">Distancia real de referencia (metros)</label>
                <div className="flex overflow-hidden border border-[#8bb5c9] bg-white focus-within:border-[#0566aa] focus-within:ring-2 focus-within:ring-[#0566aa]/15">
                  <input
                    id="calibration-meters"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={calibrationMeters}
                    onChange={(event) => setCalibrationMeters(event.target.value)}
                    className="h-11 min-w-0 flex-1 px-3 text-sm font-semibold text-[#0b2940] outline-none"
                    required
                    autoFocus
                  />
                  <span className="flex items-center border-l border-[#c7d7df] bg-[#f4fafc] px-3 font-mono text-xs font-bold text-[#315c70]">m</span>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-[#607d8b]">Al guardar, los tramos existentes y los nuevos se medirán en metros reales con esta escala. El zoom visual no altera las medidas.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#d3e1e8] px-5 py-4">
              <button type="button" onClick={cancelCalibration} className="h-9 border border-[#b4cbd8] bg-white px-3 text-xs font-bold text-[#315c70] transition hover:bg-[#eaf6fb]">Cancelar</button>
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 bg-[#0566aa] px-3 text-xs font-bold text-white transition hover:bg-[#004d84]">
                <span className="material-symbols-outlined text-[16px]">straighten</span>
                Guardar escala
              </button>
            </div>
          </form>
        </div>
      )}

      {blueprint.imageUrl && pendingPhotos.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-xl border border-[#b6d0dd] bg-white/95 p-2 shadow-sm backdrop-blur">
          <span className="hidden font-mono text-[9px] font-bold tracking-[0.12em] text-[#527284] sm:inline">ARRASTRA</span>
          {pendingPhotos.map((photo) => {
            const type = getElementType(photo);
            const icon = type === 'camara' ? 'videocam' : type === 'tuberia' ? 'timeline' : 'inventory_2';
            const color = type === 'camara' ? 'bg-[#0566aa]' : type === 'tuberia' ? 'bg-[#073f74]' : 'bg-[#b77812]';
            return (
              <button
                key={`palette-${photo.id}`}
                type="button"
                draggable
                onDragStart={(event) => startDragging(event, photo, 'palette')}
                onDragEnd={() => {
                  dragTargetRef.current = null;
                  setDragTarget(null);
                }}
                onClick={() => selectForPlacement(photo)}
                className={`flex h-9 w-9 cursor-grab items-center justify-center rounded-full border-2 border-white ${color} text-white shadow-sm transition hover:scale-110 active:cursor-grabbing`}
                title={`Arrastra o selecciona ${elementLabel(photo)} para ubicarlo`}
                aria-label={`Arrastra o selecciona ${elementLabel(photo)} para ubicarlo`}
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
              </button>
            );
          })}
        </div>
      )}

      {placementInstruction && (
        <div className="absolute bottom-5 left-1/2 z-30 flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#73b7d4] bg-[#073f74] px-4 py-3 text-sm text-white shadow-xl">
          <span className="material-symbols-outlined text-[21px] text-cyan-200">ads_click</span>
          <p className="flex-1 font-medium">{placementInstruction}</p>
          {creationMode === 'tuberia' && pipeStart && (
            <div className="flex shrink-0 overflow-hidden rounded-md border border-cyan-100/35 bg-white/10 text-[10px] font-bold">
              {([
                ['libre', 'Libre'],
                ['horizontal', 'H'],
                ['vertical', 'V'],
                ['diagonal', '45°'],
              ] as const).map(([alignment, label]) => (
                <button
                  key={alignment}
                  type="button"
                  onClick={() => setPipeAlignment(alignment)}
                  className={`h-7 min-w-7 border-l border-cyan-100/20 px-1.5 transition first:border-l-0 ${pipeAlignment === alignment ? 'bg-cyan-200 text-[#073f74]' : 'text-cyan-50 hover:bg-white/10'}`}
                  title={`Alinear nuevo tramo: ${label}`}
                  aria-pressed={pipeAlignment === alignment}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setPlacement(null); setCreationMode(null); setPipeStart(null); setPipePreview(null); if (calibrationMode) cancelCalibration(); }} className="rounded-md px-2 py-1 text-xs font-bold text-cyan-100 hover:bg-white/10">Cancelar</button>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
        {blueprint.imageUrl && (
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center divide-x divide-[#c7d7df] overflow-hidden rounded-xl border border-[#c7d7df] bg-white/95 shadow-sm">
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#0566aa]">zoom_in</span>
              <span className="font-mono text-[10px] font-bold text-[#355c70]">PLANO {Math.round(planScale * 100)}%</span>
              <button type="button" onClick={() => adjustPlanScale(-0.1)} disabled={planScale <= 0.6} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Reducir tamaño del plano" title="Reducir plano">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <button type="button" onClick={() => adjustPlanScale(0.1)} disabled={planScale >= 1.8} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Aumentar tamaño del plano" title="Aumentar plano">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#b77812]">ads_click</span>
              <span className="font-mono text-[10px] font-bold text-[#355c70]">ICONOS {Math.round(iconScale * 100)}%</span>
              <button type="button" onClick={() => adjustIconScale(-0.1)} disabled={iconScale <= 0.4} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Reducir tamaño de los iconos" title="Reducir iconos">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <button type="button" onClick={() => adjustIconScale(0.1)} disabled={iconScale >= 1.8} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Aumentar tamaño de los iconos" title="Aumentar iconos">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#0b5d8c]">text_fields</span>
              <span className="font-mono text-[10px] font-bold text-[#355c70]">TEXTOS {Math.round(textScale * 100)}%</span>
              <button type="button" onClick={() => adjustTextScale(-0.1)} disabled={textScale <= 0.5} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Reducir tamaño de los textos del plano" title="Reducir textos">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <button type="button" onClick={() => adjustTextScale(0.1)} disabled={textScale >= 1.8} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Aumentar tamaño de los textos del plano" title="Aumentar textos">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          </div>
        )}
        {blueprint.imageUrl && (
          <button type="button" onClick={startCalibration} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold shadow-sm transition ${blueprint.calibration ? 'border-[#6ca9c5] bg-[#eaf6fb] text-[#075a91] hover:bg-[#dff2fa]' : 'border-[#e0bf78] bg-white text-[#8b5d05] hover:bg-[#fff6df]'}`} title="Calibrar el plano con una distancia conocida">
            <span className="material-symbols-outlined text-[18px]">straighten</span>
            <span className="hidden sm:inline">{blueprint.calibration ? 'Escala activa' : 'Calibrar'}</span>
          </button>
        )}
        <div className="hidden rounded-xl border border-[#c7d7df] bg-white/95 px-3 py-2 text-[11px] text-[#426373] shadow-sm sm:block">
          <strong className="text-[#0b2940]">{photos.filter((photo) => isPlaced(photo)).length}</strong> ubicados · <strong className="text-[#0b2940]">{totalPipelineMeters.toFixed(1)} m</strong> de tubería
        </div>
        <button type="button" onClick={() => setIsFullscreen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c7d7df] bg-white text-[#285b72] shadow-sm transition hover:bg-[#eaf6fb]" title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
          <span className="material-symbols-outlined text-[20px]">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
        </button>
      </div>

      {isPanelOpen && (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" onClick={() => setIsPanelOpen(false)} aria-label="Cerrar panel de elementos" />
          <aside className="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#b8cfda] bg-white shadow-[-16px_0_42px_rgba(12,57,86,0.22)]">
            <div className="flex items-center justify-between border-b border-[#d6e2e8] px-5 py-4">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-[#507184]">UBICACIÓN MANUAL</p>
                <h2 className="mt-0.5 text-lg font-bold text-[#0b2940]">Elementos del plano</h2>
              </div>
              <button type="button" onClick={() => setIsPanelOpen(false)} aria-label="Cerrar panel" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c7d7df] text-[#315c70] transition hover:bg-[#eaf6fb]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="rounded-xl border border-[#b7d5e4] bg-[#eaf6fb] p-3 text-xs leading-5 text-[#154860]">
                Selecciona un elemento y luego haz clic sobre el JPG. Las tuberías se dibujan con dos clics: inicio y final.
              </div>
              <h3 className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#527284]">Pendientes de ubicación ({pendingPhotos.length})</h3>
              <div className="mt-3 space-y-2">
                {pendingPhotos.length ? pendingPhotos.map((photo) => {
                  const type = getElementType(photo);
                  const isPipe = type === 'tuberia';
                  const description = isPipe && isPlaced(photo) ? 'Falta marcar el punto final' : isPipe ? 'Requiere inicio y final' : 'Requiere un punto';
                  return (
                    <button key={photo.id} type="button" onClick={() => selectForPlacement(photo)} className="flex w-full items-center gap-3 rounded-xl border border-[#d5e1e7] bg-white p-3 text-left transition hover:border-[#63a7c5] hover:bg-[#f5fbfd]">
                      <span className={`material-symbols-outlined rounded-lg p-2 text-white ${type === 'camara' ? 'bg-[#0566aa]' : type === 'tuberia' ? 'bg-[#007f98]' : 'bg-[#b77812]'}`}>
                        {type === 'camara' ? 'videocam' : type === 'tuberia' ? 'timeline' : 'inventory_2'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[#143b4d]">{elementLabel(photo)}</span>
                        <span className="block truncate text-xs text-[#607d8b]">{description}</span>
                      </span>
                      <span className="material-symbols-outlined text-[#0566aa]">add_location_alt</span>
                    </button>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed border-[#c7d7df] p-5 text-center text-sm text-[#607d8b]">Todos los elementos están ubicados en el plano.</div>
                )}
              </div>

              <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-[#527284]">Ya ubicados ({photos.length - pendingPhotos.length})</h3>
              <div className="mt-3 space-y-1.5">
                {photos.filter((photo) => isPlaced(photo)).map((photo) => (
                  <button key={photo.id} type="button" onClick={() => onSelectPhoto(photo)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#395f70] transition hover:bg-[#f0f8fb]">
                    <span className="material-symbols-outlined text-[17px] text-[#0566aa]">location_on</span>
                    <span className="min-w-0 flex-1 truncate">{elementLabel(photo)}</span>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-[#d6e2e8] p-4">
              <button type="button" onClick={onNavigateToUpload} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0566aa] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#004d84]">
                <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                Registrar elemento nuevo
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};
