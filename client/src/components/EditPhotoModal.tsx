/**
 * Diseño: cartografía técnica sobria. Las propiedades se acotan al tipo del
 * objeto seleccionado; una tubería nunca guarda datos de cámara, y viceversa.
 */
import React, { useRef, useState } from 'react';
import { CableGauge, CableType, CABLE_TYPE_OPTIONS, getCableGaugeOptionsForPlanArea, InspectionPhoto, ExecutionStatus, CameraCode, CameraType, ElementType, ActaLabelPosition, getElectricalElementOption, getElectricalPlanArea, getElementType, getPipeNetworkOption, PIPE_NETWORK_OPTIONS, PipeNetworkType } from '../types';
import { WAREHOUSE_LOCATIONS, CAMERA_CODES, CAMERA_TYPES } from '../data/mockData';
import { compressImageForDevice } from '../services/deviceStorageService';
import { TramoSelector } from './TramoSelector';

const ACTAS_STORAGE_KEY = 'photovault_actas_catalog';
const DEFAULT_ACTAS = Array.from({ length: 10 }, (_, index) => `Acta ${index + 1}`);

const loadActas = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTAS_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return DEFAULT_ACTAS;
    const customActas = saved
      .filter((acta): acta is string => typeof acta === 'string' && acta.trim().length > 0)
      .map((acta) => acta.trim());
    return Array.from(new Set([...DEFAULT_ACTAS, ...customActas]));
  } catch {
    return DEFAULT_ACTAS;
  }
};

interface EditPhotoModalProps {
  photo: InspectionPhoto;
  isOpen: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (updated: InspectionPhoto) => void;
}

export const EditPhotoModal: React.FC<EditPhotoModalProps> = ({
  photo,
  isOpen,
  isAdmin,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(photo.name ?? '');
  const [type, setType] = useState(photo.type ?? photo.categoryLabel ?? '');
  const [location, setLocation] = useState(photo.location ?? '');
  const [cameraCode, setCameraCode] = useState<CameraCode>(photo.cameraCode || 'SB850');
  const [cameraType, setCameraType] = useState<CameraType>(photo.cameraType || 'MT');
  const [acta, setActa] = useState(photo.acta ?? '');
  const [actaLabelPosition, setActaLabelPosition] = useState<ActaLabelPosition>(photo.actaLabelPosition || 'derecha');
  const [actas, setActas] = useState<string[]>(loadActas);
  const [newActa, setNewActa] = useState('');
  const [actaMessage, setActaMessage] = useState<string | null>(null);
  const [elementType, setElementType] = useState<ElementType>(() => getElementType(photo));
  const [tramo, setTramo] = useState<string>(photo.tramo || '3x4"');
  const [metraje, setMetraje] = useState<string>(photo.metraje !== undefined ? String(photo.metraje) : '');
  const [pipeNetworkType, setPipeNetworkType] = useState<PipeNetworkType>(getPipeNetworkOption(photo.pipeNetworkType).value);
  const [cableType, setCableType] = useState<CableType>(photo.cableType || (photo.planArea === 'electrical_lighting' ? 'alumbrado' : photo.planArea === 'electrical_bt' ? 'baja_tension' : 'media_tension'));
  const [cableGauge, setCableGauge] = useState<CableGauge>(() => {
    const availableGauges = getCableGaugeOptionsForPlanArea(photo.planArea);
    return availableGauges.includes(photo.cableGauge as CableGauge) ? photo.cableGauge as CableGauge : availableGauges[0];
  });
  const [cableMeters, setCableMeters] = useState<string>(photo.cableMeters !== undefined ? String(photo.cableMeters) : '');
  const [fieldNotes, setFieldNotes] = useState(photo.fieldNotes ?? '');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>(photo.executionStatus || 'En proceso');
  const [requiresImmediateAction, setRequiresImmediateAction] = useState(photo.requiresImmediateAction ?? false);
  const [verified, setVerified] = useState(photo.verified ?? false);
  const [imageUrls, setImageUrls] = useState<string[]>(() => {
    return Array.isArray(photo.imageUrls)
      ? photo.imageUrls.filter((url): url is string => Boolean(url) && !url.startsWith('data:image/svg+xml'))
      : [];
  });
  const [imageSize, setImageSize] = useState(photo.fileSize ?? '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [photoIndexPendingRemoval, setPhotoIndexPendingRemoval] = useState<number | null>(null);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const electricalOption = getElectricalElementOption(photo.electricalType);
  const electricalArea = getElectricalPlanArea(photo.electricalType);
  const cableGaugeOptions = getCableGaugeOptionsForPlanArea(photo.planArea);

  if (!isOpen) return null;

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;
    const validFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setImageError('Selecciona una imagen válida en formato JPG, PNG, WebP o HEIC.');
      return;
    }

    const remainingSlots = Math.max(0, 6 - imageUrls.length);
    if (remainingSlots === 0) {
      setImageError('Cada elemento puede conservar hasta 6 fotos de evidencia. Elimina una para agregar otra.');
      event.target.value = '';
      return;
    }

    setImageError(null);
    setIsProcessingImage(true);
    try {
      const filesToProcess = validFiles.slice(0, remainingSlots);
      const optimizedImages = await Promise.all(filesToProcess.map((file) => compressImageForDevice(file, 1280, 960, 0.76)));
      const originalSize = filesToProcess.reduce((total, file) => total + file.size, 0);
      setImageUrls((previous) => [...previous, ...optimizedImages].slice(0, 6));
      setImageSize(originalSize > 1024 * 1024
        ? `${(originalSize / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(originalSize / 1024))} KB`);
      if (filesToProcess.length < selectedFiles.length) {
        setImageError('Se agregaron las fotos disponibles hasta el máximo de 6 por elemento.');
      }
    } catch {
      setImageError('No se pudo optimizar la foto. Intenta con otro archivo.');
    } finally {
      setIsProcessingImage(false);
      event.target.value = '';
    }
  };

  const requestPhotoRemoval = (index: number) => {
    if (imageUrls.length <= 1) {
      setImageError('El elemento debe conservar una foto de portada. Agrega otra evidencia antes de eliminar esta foto.');
      return;
    }
    setImageError(null);
    setPhotoIndexPendingRemoval(index);
  };

  const confirmPhotoRemoval = () => {
    if (photoIndexPendingRemoval === null) return;
    setImageUrls((previous) => previous.filter((_, index) => index !== photoIndexPendingRemoval));
    setPhotoIndexPendingRemoval(null);
  };

  const movePhoto = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setImageUrls((previous) => {
      const reordered = [...previous];
      const [movedPhoto] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedPhoto);
      return reordered;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedImageUrls = imageUrls;
    onSave({
      ...photo,
      name: isAdmin ? name.trim() || photo.name : photo.name,
      type: type.trim() || photo.type,
      location: location.trim() || photo.location,
      imageUrl: savedImageUrls[0] || photo.imageUrl,
      imageUrls: savedImageUrls,
      fileSize: imageSize || photo.fileSize,
      resolution: JSON.stringify(savedImageUrls) !== JSON.stringify(photo.imageUrls || [photo.imageUrl]) ? 'Fotos adjuntas desde propiedades' : photo.resolution,
      elementType: isAdmin ? elementType : photo.elementType,
      cameraCode: elementType === 'camara' ? cameraCode : undefined,
      cameraType: isAdmin ? (elementType === 'camara' ? cameraType : undefined) : photo.cameraType,
      acta: isAdmin ? acta || undefined : photo.acta,
      actaLabelPosition: isAdmin ? (acta ? actaLabelPosition : undefined) : photo.actaLabelPosition,
      tramo: elementType === 'tuberia' ? tramo.trim() || undefined : undefined,
      metraje: elementType === 'tuberia' ? metraje.trim() || undefined : undefined,
      pipeNetworkType: elementType === 'tuberia' ? pipeNetworkType : undefined,
      pipeColor: elementType === 'tuberia' ? getPipeNetworkOption(pipeNetworkType).color : undefined,
      cableType: photo.electricalType === 'cableado' ? cableType : undefined,
      cableGauge: photo.electricalType === 'cableado' ? cableGauge : undefined,
      cableMeters: photo.electricalType === 'cableado' ? cableMeters.trim() || undefined : undefined,
      fieldNotes: fieldNotes.trim(),
      executionStatus,
      requiresImmediateAction,
      status: requiresImmediateAction ? 'Flagged' : 'Synced',
      verified,
    });
    onClose();
  };

  const addActa = () => {
    const value = newActa.trim();
    if (!value) {
      setActaMessage('Escribe el nombre o número del acta para agregarla.');
      return;
    }

    const existing = actas.find((option) => option.toLocaleLowerCase('es-CO') === value.toLocaleLowerCase('es-CO'));
    if (existing) {
      setActa(existing);
      setNewActa('');
      setActaMessage(`"${existing}" ya estaba disponible y quedó asignada.`);
      return;
    }

    const updatedActas = [...actas, value];
    setActas(updatedActas);
    setActa(value);
    setNewActa('');
    setActaMessage(`"${value}" fue agregada y asignada al elemento.`);
    localStorage.setItem(ACTAS_STORAGE_KEY, JSON.stringify(updatedActas));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full border border-[#c2c6d4] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#e6f6ff] p-4 border-b border-[#c2c6d4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004d99]">edit_document</span>
            <h3 className="font-['Hanken_Grotesk'] font-bold text-lg text-[#071e27]">
              Editar Detalles de la Inspección
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#424752] hover:text-[#ba1a1a]"
            title="Cerrar ventana"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
              Nombre de la Inspección
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              className="w-full bg-[#f3faff] border border-[#c2c6d4] rounded-lg p-2.5 text-[14px] text-[#071e27] focus:border-[#004d99] focus:outline-none"
              required
            />
          </div>

          <div className="rounded-xl border border-[#b7d5e4] bg-[#f8fbfd] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-['Inter'] text-[13px] font-bold text-[#071e27]">Fotos de evidencia</p>
                <p className="mt-0.5 text-[11px] text-[#607d8b]">Agrega hasta 6 fotos desde la galería o la cámara. La primera es la portada del elemento.</p>
              </div>
              <span className="material-symbols-outlined text-[21px] text-[#0566aa]">add_a_photo</span>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {imageUrls.length === 0 && (
                  <div className="col-span-full flex min-h-24 items-center gap-3 rounded-lg border border-dashed border-[#a7c8da] bg-[#f3faff] px-3 py-3 text-[#466473]" role="status">
                    <span className="material-symbols-outlined grid h-9 w-9 place-items-center rounded-full bg-white text-[20px] text-[#607d8b]">hide_image</span>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide">Sin evidencia</p>
                      <p className="mt-0.5 text-[11px] leading-4">Aún no hay fotos disponibles para este elemento.</p>
                    </div>
                  </div>
                )}
                {imageUrls.map((url, index) => (
                  <div
                    key={`${url.slice(0, 32)}-${index}`}
                    draggable={imageUrls.length > 1}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', String(index));
                      setDraggedPhotoIndex(index);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (draggedPhotoIndex !== null && draggedPhotoIndex !== index) setDragOverPhotoIndex(index);
                    }}
                    onDragLeave={() => setDragOverPhotoIndex((current) => current === index ? null : current)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedPhotoIndex !== null) movePhoto(draggedPhotoIndex, index);
                      setDraggedPhotoIndex(null);
                      setDragOverPhotoIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggedPhotoIndex(null);
                      setDragOverPhotoIndex(null);
                    }}
                    className={`group relative aspect-square overflow-hidden rounded-lg border bg-[#e6f6ff] transition ${draggedPhotoIndex === index ? 'scale-95 border-[#0566aa] opacity-55' : dragOverPhotoIndex === index ? 'border-[#0566aa] ring-2 ring-cyan-300 ring-offset-1' : 'border-[#a7c8da]'} ${imageUrls.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <button type="button" onClick={() => setImageUrls((previous) => [previous[index], ...previous.filter((_, itemIndex) => itemIndex !== index)])} className="h-full w-full" title={index === 0 ? 'Foto de portada' : 'Usar como foto de portada'}>
                      <img src={url} alt={`Foto de evidencia ${index + 1}`} className="h-full w-full object-cover" />
                    </button>
                    {index === 0 && <span className="absolute left-1 top-1 rounded bg-[#073f74] px-1 py-0.5 text-[8px] font-bold text-white">PORTADA</span>}
                    {imageUrls.length > 1 && <span className="pointer-events-none absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-[#073f74]/85 text-white" title="Arrastra para reordenar"><span className="material-symbols-outlined text-[13px]">drag_indicator</span></span>}
                    <button type="button" onClick={() => requestPhotoRemoval(index)} className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-white shadow-sm transition ${imageUrls.length > 1 ? 'bg-[#8b1d1d] hover:bg-[#6f1515]' : 'bg-[#607d8b] hover:bg-[#466473]'}`} title={imageUrls.length > 1 ? `Eliminar foto ${index + 1}` : 'Agrega otra foto antes de eliminar la portada'} aria-label={imageUrls.length > 1 ? `Eliminar foto ${index + 1}` : 'La foto de portada no puede eliminarse todavía'}>
                      <span className="material-symbols-outlined text-[13px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0566aa] bg-white px-3 text-[12px] font-bold text-[#004d99] transition hover:bg-[#e6f6ff] disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_library</span>
                    Galería
                  </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isProcessingImage}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0566aa] px-3 text-[12px] font-bold text-white transition hover:bg-[#004d99] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[16px]">{isProcessingImage ? 'progress_activity' : 'photo_camera'}</span>
                  {isProcessingImage ? 'Optimizando…' : 'Tomar foto'}
                </button>
                </div>
                <p className="mt-1.5 text-[10px] text-[#607d8b]">{imageUrls.length === 0 ? 'Sin evidencia cargada. Usa Galería o Tomar foto para adjuntarla. ' : `${imageUrls.length}/6 fotos. ${imageUrls.length > 1 ? 'Arrastra las miniaturas para ordenarlas; la primera es la portada. ' : ''}`}{imageSize ? `Última carga original: ${imageSize}.` : 'Cada imagen se optimiza antes de guardarse.'}</p>
              </div>
            </div>
            {imageError && <p className="mt-2 text-[11px] font-medium text-[#ba1a1a]">{imageError}</p>}
            <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </div>

          {photoIndexPendingRemoval !== null && (
            <div className="rounded-xl border border-[#e6b4b0] bg-[#fff8f7] p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined mt-0.5 text-[19px] text-[#a52d27]">warning</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#7f1d1d]">¿Eliminar la foto {photoIndexPendingRemoval + 1}?</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#7f3a35]">La foto se retirará de la galería cuando guardes las propiedades del elemento.</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setPhotoIndexPendingRemoval(null)} className="rounded-md border border-[#d5b6b2] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#6e4944] hover:bg-[#fff1ef]">Cancelar</button>
                    <button type="button" onClick={confirmPhotoRemoval} className="rounded-md bg-[#a52d27] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#861f1b]">Eliminar foto</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
              Estado de la Inspección
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setExecutionStatus('No iniciado')}
                className={`py-2.5 px-3 rounded-lg border font-['Inter'] font-bold text-[13px] flex items-center justify-center gap-2 transition-all ${
                  executionStatus === 'No iniciado'
                    ? 'bg-[#607d8b] text-white border-[#607d8b] shadow-xs'
                    : 'bg-[#f3faff] text-[#424752] border-[#c2c6d4] hover:bg-[#e6f6ff]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">schedule</span>
                No iniciado
              </button>
              <button
                type="button"
                onClick={() => setExecutionStatus('En proceso')}
                className={`py-2.5 px-3 rounded-lg border font-['Inter'] font-bold text-[13px] flex items-center justify-center gap-2 transition-all ${
                  executionStatus === 'En proceso'
                    ? 'bg-[#f59e0b] text-white border-[#f59e0b] shadow-xs'
                    : 'bg-[#f3faff] text-[#424752] border-[#c2c6d4] hover:bg-[#e6f6ff]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                En proceso
              </button>
              <button
                type="button"
                onClick={() => setExecutionStatus('Terminado')}
                className={`py-2.5 px-3 rounded-lg border font-['Inter'] font-bold text-[13px] flex items-center justify-center gap-2 transition-all ${
                  executionStatus === 'Terminado'
                    ? 'bg-[#16a34a] text-white border-[#16a34a] shadow-xs'
                    : 'bg-[#f3faff] text-[#424752] border-[#c2c6d4] hover:bg-[#e6f6ff]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Terminado
              </button>
            </div>
          </div>

          <div>
            <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
              Tipo de Análisis
            </label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Ej. Integridad Estructural, Válvula de Tubería"
              className="w-full bg-[#f3faff] border border-[#c2c6d4] rounded-lg p-2.5 text-[14px] text-[#071e27] focus:border-[#004d99] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27]">
                Ubicación / Bodega
              </label>
              <span className="text-[11px] font-medium text-[#004d99]">
                62 Bodegas disponibles
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                list="edit-warehouse-locations-list"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Selecciona o escribe: Bodega 1 ... Bodega 62"
                className="w-full bg-[#f3faff] border border-[#c2c6d4] rounded-lg pl-3 pr-24 py-2.5 text-[14px] text-[#071e27] focus:border-[#004d99] focus:outline-none"
              />
              <select
                aria-label="Seleccionar bodega rápida para edición"
                value={WAREHOUSE_LOCATIONS.includes(location) ? location : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setLocation(e.target.value);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#004d99] bg-[#cfe6f2]/60 hover:bg-[#cfe6f2] border border-[#004d99]/30 rounded px-2 py-1 outline-none cursor-pointer"
              >
                <option value="">Elegir Bodega...</option>
                {WAREHOUSE_LOCATIONS.map((bodega) => (
                  <option key={bodega} value={bodega}>
                    {bodega}
                  </option>
                ))}
              </select>
              <datalist id="edit-warehouse-locations-list">
                {WAREHOUSE_LOCATIONS.map((bodega) => (
                  <option key={bodega} value={bodega} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="rounded-xl border border-[#b7d5e4] bg-[#f8fbfd] p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <label htmlFor="inspection-acta" className="block font-['Inter'] text-[13px] font-bold text-[#071e27]">Acta asignada</label>
                <p className="mt-0.5 text-[11px] text-[#607d8b]">Selecciona un acta del listado o incorpora una nueva para futuras asignaciones.</p>
              </div>
              <span className="material-symbols-outlined text-[21px] text-[#0566aa]">assignment</span>
            </div>
            <select
              id="inspection-acta"
              value={acta}
              onChange={(event) => {
                setActa(event.target.value);
                setActaMessage(null);
              }}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[#c2c6d4] bg-white p-2.5 text-[14px] text-[#071e27] outline-none focus:border-[#004d99]"
            >
              <option value="">Sin acta asignada</option>
              {actas.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {isAdmin && <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newActa}
                onChange={(event) => setNewActa(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addActa();
                  }
                }}
                placeholder="Ej. Acta 11 o Acta de entrega"
                className="min-w-0 flex-1 rounded-lg border border-[#c2c6d4] bg-white px-3 py-2 text-[12px] text-[#071e27] outline-none focus:border-[#004d99]"
              />
              <button type="button" onClick={addActa} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#0566aa] bg-white px-3 py-2 text-[12px] font-bold text-[#004d99] transition hover:bg-[#e6f6ff]">
                <span className="material-symbols-outlined text-[16px]">add</span>
                Agregar
              </button>
            </div>}
            {actaMessage && <p className="mt-2 text-[11px] font-medium text-[#075a91]" role="status">{actaMessage}</p>}
            {acta && (
              <div className="mt-3 border-t border-[#d6e4ea] pt-3">
                <label htmlFor="inspection-acta-label-position" className="block font-['Inter'] text-[12px] font-bold text-[#173f58]">Posición del texto en el plano</label>
                <p className="mt-0.5 text-[11px] text-[#607d8b]">Define dónde se verá el rótulo respecto al icono o tramo.</p>
                <select
                  id="inspection-acta-label-position"
                  value={actaLabelPosition}
                  onChange={(event) => setActaLabelPosition(event.target.value as ActaLabelPosition)}
                  disabled={!isAdmin}
                  className="mt-2 w-full rounded-lg border border-[#c2c6d4] bg-white p-2.5 text-[13px] text-[#071e27] outline-none focus:border-[#004d99]"
                >
                  <option value="arriba">Arriba del elemento</option>
                  <option value="abajo">Abajo del elemento</option>
                  <option value="izquierda">A la izquierda del elemento</option>
                  <option value="derecha">A la derecha del elemento</option>
                </select>
              </div>
            )}
          </div>

          {elementType === 'electrico' && (
            <div className="rounded-xl border border-[#d8c3fb] bg-[#faf7ff] p-3">
              <p className="font-['Inter'] text-[13px] font-bold text-[#3b1b75]">Activo eléctrico del plano</p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#e5d9fa] bg-white p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: photo.electricalColor || electricalOption.color }}>
                  <span className="material-symbols-outlined text-[21px]">{electricalOption.icon}</span>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#3b1b75]">{electricalOption.label}</p>
                  <p className="mt-0.5 text-[11px] text-[#6b5a85]">
                    {electricalArea === 'electrical_mt' ? 'Obras Eléctricas MT' : electricalArea === 'electrical_bt' ? 'Obras Eléctricas BT' : 'Obras Eléctricas Alumbrado'}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#6b5a85]">El activo y su capa se definen en el plano. Aquí solo se actualizan propiedades operativas permitidas.</p>
            </div>
          )}

          {photo.electricalType === 'cableado' && (
            <div className="rounded-xl border border-[#c7d9ec] bg-[#f6fbff] p-3">
              <p className="font-['Inter'] text-[13px] font-bold text-[#0c4a6e]">Propiedades del cableado</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[12px] font-bold text-[#173f58]">Tipo de cable</label>
                  <select value={cableType} onChange={(event) => setCableType(event.target.value as CableType)} className="mt-1.5 w-full rounded-lg border border-[#bcd4e6] bg-white p-2 text-[13px] text-[#173f58] outline-none focus:border-[#0369a1]">
                    {CABLE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#173f58]">Calibre del cable</label>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {cableGaugeOptions.map((gauge) => (
                      <button key={gauge} type="button" onClick={() => setCableGauge(gauge)} className={`rounded-md border px-1 py-2 text-[11px] font-bold ${cableGauge === gauge ? 'border-[#0369a1] bg-[#0369a1] text-white' : 'border-[#bcd4e6] bg-white text-[#36576e]'}`}>{gauge}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-[12px] font-bold text-[#173f58]">Medida del cable en metros</label>
                <input type="number" min="0" step="0.01" value={cableMeters} onChange={(event) => setCableMeters(event.target.value)} placeholder="Ej. 125.50" className="mt-1.5 w-full rounded-lg border border-[#bcd4e6] bg-white p-2 text-[13px] text-[#173f58] outline-none focus:border-[#0369a1]" />
              </div>
            </div>
          )}

          <div className={elementType === 'electrico' ? 'hidden' : 'rounded-xl border border-[#c2c6d4] bg-[#f8fbfd] p-3'}>
            <label className="mb-2 block font-['Inter'] text-[13px] font-bold text-[#071e27]">Tipo de elemento en el plano</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['caja', 'Caja', 'inventory_2', 'bg-amber-500'],
                ['camara', 'Cámara', 'videocam', 'bg-sky-600'],
                ['tuberia', 'Tubería', 'timeline', 'bg-violet-600'],
              ] as const).map(([value, label, icon, activeClass]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => isAdmin && setElementType(value)}
                  disabled={!isAdmin}
                  aria-pressed={elementType === value}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-bold transition-all active:scale-[0.97] ${
                    elementType === value
                      ? `${activeClass} border-transparent text-white shadow-sm`
                      : 'border-[#c2c6d4] bg-white text-[#424752] hover:border-[#004d99]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {elementType === 'camara' && (
            <>
          {/* Camera Code (SB850, SB851, SB858) & Camera Type (MT, BT, Datos) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
                Código de Cámara
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {CAMERA_CODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCameraCode(code)}
                    className={`py-2 px-1 rounded-lg border font-['Inter'] font-bold text-[12px] flex items-center justify-center gap-1 transition-all ${
                      cameraCode === code
                        ? 'bg-[#004d99] text-white border-[#004d99] shadow-xs'
                        : 'bg-[#f3faff] text-[#424752] border-[#c2c6d4] hover:bg-[#e6f6ff]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">videocam</span>
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
                Tipo de Red / Sistema
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {CAMERA_TYPES.map((typeOption) => (
                  <button
                    key={typeOption}
                    type="button"
                    onClick={() => isAdmin && setCameraType(typeOption)}
                    disabled={!isAdmin}
                    className={`py-2 px-1 rounded-lg border font-['Inter'] font-bold text-[12px] flex items-center justify-center gap-1 transition-all ${
                      cameraType === typeOption
                        ? typeOption === 'MT'
                          ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs'
                          : typeOption === 'BT'
                          ? 'bg-[#059669] text-white border-[#059669] shadow-xs'
                          : 'bg-[#7c3aed] text-white border-[#7c3aed] shadow-xs'
                        : 'bg-[#f3faff] text-[#424752] border-[#c2c6d4] hover:bg-[#e6f6ff]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {typeOption === 'MT' ? 'bolt' : typeOption === 'BT' ? 'electric_bolt' : 'lan'}
                    </span>
                    {typeOption}
                  </button>
                ))}
              </div>
            </div>
          </div>

            </>
          )}
          {elementType === 'tuberia' && (
            <>
          <div className="rounded-lg border border-[#b7d5e4] bg-[#f4fbfe] p-3">
            <p className="font-['Inter'] text-[12px] font-bold text-[#173f58]">Tipo de red del tramo</p>
            <p className="mt-0.5 text-[11px] text-[#607d8b]">El color se asigna automáticamente al guardar y se refleja en el plano.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PIPE_NETWORK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPipeNetworkType(option.value)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 border px-2 text-[11px] font-bold transition ${
                    pipeNetworkType === option.value
                      ? 'border-[#073f74] bg-white text-[#073f74] ring-2 ring-cyan-200'
                      : 'border-[#c2dbe7] bg-white text-[#547181] hover:bg-[#eaf6fb]'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Tramo de Tubería y Metraje (Cantidad x Dimensión + Metros Lineales) */}
          <div>
            <TramoSelector
              tramo={tramo}
              onTramoChange={setTramo}
              metraje={metraje}
              onMetrajeChange={setMetraje}
              label="Propiedades de Tramo y Metraje de Tubería (4&quot;, 6&quot;, etc.)"
            />
          </div>
            </>
          )}

          <div>
            <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
              Notas de Campo y Hallazgos
            </label>
            <textarea
              rows={4}
              value={fieldNotes}
              onChange={(e) => setFieldNotes(e.target.value)}
              className="w-full bg-[#f3faff] border border-[#c2c6d4] rounded-lg p-2.5 text-[14px] text-[#071e27] focus:border-[#004d99] focus:outline-none"
            />
          </div>

          <div className="pt-2 border-t border-[#c2c6d4] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[13px] text-[#071e27]">¿Requiere Acción Inmediata?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRequiresImmediateAction(true)}
                  className={`px-3 py-1 text-[12px] font-bold rounded ${
                    requiresImmediateAction ? 'bg-[#ba1a1a] text-white' : 'bg-[#ECEFF1] text-[#424752]'
                  }`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setRequiresImmediateAction(false)}
                  className={`px-3 py-1 text-[12px] font-bold rounded ${
                    !requiresImmediateAction ? 'bg-[#1b6d24] text-white' : 'bg-[#ECEFF1] text-[#424752]'
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-[13px] text-[#071e27]">Estado de Verificación</span>
              <button
                type="button"
                onClick={() => setVerified(!verified)}
                className={`px-3 py-1 text-[12px] font-bold rounded flex items-center gap-1 ${
                  verified ? 'bg-[#a0f399] text-[#217128]' : 'bg-[#cfe6f2] text-[#424752]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {verified ? 'check_circle' : 'pending'}
                </span>
                {verified ? 'Verificado' : 'Pendiente'}
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#c2c6d4]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#c2c6d4] text-[#424752] font-bold text-[13px] rounded-lg hover:bg-[#e6f6ff]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#004d99] text-white font-bold text-[13px] rounded-lg hover:bg-[#1565c0]"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
