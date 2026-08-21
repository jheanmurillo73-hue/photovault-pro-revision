/**
 * Diseño: plano técnico operativo. El JPG es el lienzo principal, se ajusta por
 * completo al área disponible y las ubicaciones se expresan como porcentajes
 * relativos al plano, nunca como coordenadas de un proveedor cartográfico.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlueprintOverlay, getElementType, InspectionPhoto, InspectorProfile } from '../types';
import { compressImageForDevice } from '../services/deviceStorageService';
import { isQuotaExceededError, loadBlueprintImage, saveBlueprintImage } from '../services/blueprintStorageService';

interface MapViewProps {
  photos: InspectionPhoto[];
  inspector: InspectorProfile;
  onSelectPhoto: (photo: InspectionPhoto) => void;
  onNavigateToUpload: () => void;
  onUpdatePhotoPosition: (
    photoId: string,
    position: Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'>,
  ) => void;
}

type PlacementStage = 'point' | 'pipe-start' | 'pipe-end';

interface PlacementTarget {
  photo: InspectionPhoto;
  stage: PlacementStage;
}

interface DragTarget {
  photo: InspectionPhoto;
  source: 'palette' | 'plan';
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

const isPlaced = (photo: InspectionPhoto) =>
  typeof photo.planX === 'number' && typeof photo.planY === 'number';

const hasCompletePipe = (photo: InspectionPhoto) =>
  isPlaced(photo)
  && typeof photo.planEndX === 'number'
  && typeof photo.planEndY === 'number';

const elementLabel = (photo: InspectionPhoto) => {
  const type = getElementType(photo);
  if (type === 'camara') return photo.cameraCode || 'Cámara sin código';
  if (type === 'tuberia') return photo.tramo ? `Tramo ${photo.tramo}` : 'Tubería sin tramo';
  return photo.name || 'Caja sin nombre';
};

export const MapView: React.FC<MapViewProps> = ({
  photos,
  inspector,
  onSelectPhoto,
  onNavigateToUpload,
  onUpdatePhotoPosition,
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'camara' | 'caja' | 'tuberia' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [placement, setPlacement] = useState<PlacementTarget | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [iconScale, setIconScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem('photovault_plan_icon_scale'));
    return Number.isFinite(saved) ? clampScale(saved, 0.7, 1.8) : 1;
  });
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
    if (!isPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isPanelOpen]);

  const pendingPhotos = useMemo(
    () => photos.filter((photo) => {
      const type = getElementType(photo);
      return type === 'tuberia' ? !hasCompletePipe(photo) : !isPlaced(photo);
    }),
    [photos],
  );

  const visiblePhotos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return photos.filter((photo) => {
      const type = getElementType(photo);
      if (activeFilter === 'pending' && !pendingPhotos.some((pending) => pending.id === photo.id)) return false;
      if (activeFilter !== 'all' && activeFilter !== 'pending' && type !== activeFilter) return false;
      if (!query) return true;
      return [photo.name, photo.cameraCode, photo.tramo, photo.location, photo.metraje]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeFilter, pendingPhotos, photos, searchQuery]);

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

  const selectForPlacement = (photo: InspectionPhoto) => {
    const type = getElementType(photo);
    if (type === 'tuberia') {
      setPlacement({ photo, stage: isPlaced(photo) ? 'pipe-end' : 'pipe-start' });
    } else {
      setPlacement({ photo, stage: 'point' });
    }
    setIsPanelOpen(false);
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
      onUpdatePhotoPosition(target.photo.id, { planEndX: planX, planEndY: planY });
      setPlacement(null);
      return;
    }

    onUpdatePhotoPosition(target.photo.id, { planX, planY });
    setPlacement(null);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placement) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const { planX, planY } = getPlanPosition(bounds, event.clientX, event.clientY);
    placeTargetAt(placement, planX, planY);
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
      onUpdatePhotoPosition(photo.id, {
        planX: photo.planX! + shiftX,
        planY: photo.planY! + shiftY,
        planEndX: photo.planEndX! + shiftX,
        planEndY: photo.planEndY! + shiftY,
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
    setIconScale((previous) => clampScale(previous + difference, 0.7, 1.8));
  };

  const placementInstruction = placement
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
      </div>

      <main className="absolute inset-x-0 bottom-0 top-[62px] overflow-auto p-5 pt-16">
        {blueprint.imageUrl ? (
          <div className="flex min-h-full min-w-full items-center justify-center py-3">
            <div
              onClick={handleCanvasClick}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={handleCanvasDrop}
              className={`relative inline-flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-3rem)] overflow-hidden border border-[#9dbbc9] bg-white shadow-[0_18px_46px_rgba(7,63,116,0.22)] transition-transform duration-200 ${
                placement ? 'cursor-crosshair' : dragTarget ? 'ring-2 ring-[#18a9cf] ring-offset-2' : 'cursor-default'
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
                if (getElementType(photo) !== 'tuberia' || !hasCompletePipe(photo)) return null;
                const isMT = photo.cameraType === 'MT';
                return (
                  <g key={`line-${photo.id}`}>
                    <line x1={photo.planX} y1={photo.planY} x2={photo.planEndX} y2={photo.planEndY} stroke="rgba(255,255,255,0.82)" strokeWidth="2.2" strokeLinecap="round" />
                    <line x1={photo.planX} y1={photo.planY} x2={photo.planEndX} y2={photo.planEndY} stroke={isMT ? 'url(#plan-mt)' : 'url(#plan-bt)'} strokeWidth="1.1" strokeLinecap="round" />
                  </g>
                );
              })}
            </svg>

            {positionedPhotos.map((photo) => {
              const type = getElementType(photo);
              if (type === 'tuberia') {
                if (!hasCompletePipe(photo)) return null;
                const midpointX = (photo.planX! + photo.planEndX!) / 2;
                const midpointY = (photo.planY! + photo.planEndY!) / 2;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    draggable={!placement}
                    onDragStart={(event) => startDragging(event, photo, 'plan')}
                    onDragEnd={() => {
                      dragTargetRef.current = null;
                      setDragTarget(null);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPhoto(photo);
                    }}
                    style={{ left: `${midpointX}%`, top: `${midpointY}%`, transform: `translate(-50%, -50%) scale(${iconScale})` }}
                    className={`absolute z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#073f74] text-white shadow-lg transition hover:scale-110 active:cursor-grabbing ${placement ? 'pointer-events-none' : 'cursor-grab'}`}
                    title={`Abrir o mover ${elementLabel(photo)}`}
                    aria-label={`Abrir o mover ${elementLabel(photo)}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">timeline</span>
                  </button>
                );
              }

              const isCamera = type === 'camara';
              const markerColor = isCamera ? (photo.cameraType === 'BT' ? '#b94324' : '#0566aa') : '#b77812';
              return (
                  <button
                    key={photo.id}
                    type="button"
                    draggable={!placement}
                    onDragStart={(event) => startDragging(event, photo, 'plan')}
                    onDragEnd={() => {
                      dragTargetRef.current = null;
                      setDragTarget(null);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPhoto(photo);
                    }}
                    style={{ left: `${photo.planX}%`, top: `${photo.planY}%`, backgroundColor: markerColor, transform: `translate(-50%, -50%) scale(${iconScale})` }}
                    className={`absolute z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_3px_10px_rgba(6,36,58,0.35)] transition hover:scale-110 active:cursor-grabbing ${placement ? 'pointer-events-none' : 'cursor-grab'}`}
                    title={`Abrir o mover ${elementLabel(photo)}`}
                    aria-label={`Abrir o mover ${elementLabel(photo)}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{isCamera ? 'videocam' : 'inventory_2'}</span>
                  </button>
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
          <button type="button" onClick={() => setPlacement(null)} className="rounded-md px-2 py-1 text-xs font-bold text-cyan-100 hover:bg-white/10">Cancelar</button>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
        {blueprint.imageUrl && (
          <div className="flex items-center divide-x divide-[#c7d7df] overflow-hidden rounded-xl border border-[#c7d7df] bg-white/95 shadow-sm">
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
              <button type="button" onClick={() => adjustIconScale(-0.1)} disabled={iconScale <= 0.7} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Reducir tamaño de los iconos" title="Reducir iconos">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <button type="button" onClick={() => adjustIconScale(0.1)} disabled={iconScale >= 1.8} className="flex h-6 w-6 items-center justify-center rounded text-[#285b72] transition hover:bg-[#eaf6fb] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Aumentar tamaño de los iconos" title="Aumentar iconos">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          </div>
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
