/**
 * Diseño: cartografía técnica sobria. Las propiedades se acotan al tipo del
 * objeto seleccionado; una tubería nunca guarda datos de cámara, y viceversa.
 */
import React, { useRef, useState } from 'react';
import { InspectionPhoto, ExecutionStatus, CameraCode, CameraType, ElementType, getElementType } from '../types';
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
  onClose: () => void;
  onSave: (updated: InspectionPhoto) => void;
}

export const EditPhotoModal: React.FC<EditPhotoModalProps> = ({
  photo,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(photo.name ?? '');
  const [type, setType] = useState(photo.type ?? photo.categoryLabel ?? '');
  const [location, setLocation] = useState(photo.location ?? '');
  const [cameraCode, setCameraCode] = useState<CameraCode>(photo.cameraCode || 'SB850');
  const [cameraType, setCameraType] = useState<CameraType>(photo.cameraType || 'MT');
  const [acta, setActa] = useState(photo.acta ?? '');
  const [actas, setActas] = useState<string[]>(loadActas);
  const [newActa, setNewActa] = useState('');
  const [actaMessage, setActaMessage] = useState<string | null>(null);
  const [elementType, setElementType] = useState<ElementType>(() => getElementType(photo));
  const [tramo, setTramo] = useState<string>(photo.tramo || '3x4"');
  const [metraje, setMetraje] = useState<string>(photo.metraje !== undefined ? String(photo.metraje) : '');
  const [fieldNotes, setFieldNotes] = useState(photo.fieldNotes ?? '');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>(photo.executionStatus || 'En proceso');
  const [requiresImmediateAction, setRequiresImmediateAction] = useState(photo.requiresImmediateAction ?? false);
  const [verified, setVerified] = useState(photo.verified ?? false);
  const [imageUrl, setImageUrl] = useState(photo.imageUrl ?? '');
  const [imageSize, setImageSize] = useState(photo.fileSize ?? '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Selecciona una imagen válida en formato JPG, PNG, WebP o HEIC.');
      return;
    }

    setImageError(null);
    setIsProcessingImage(true);
    try {
      const optimizedImage = await compressImageForDevice(file, 1280, 960, 0.76);
      const originalSize = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;
      setImageUrl(optimizedImage);
      setImageSize(originalSize);
    } catch {
      setImageError('No se pudo optimizar la foto. Intenta con otro archivo.');
    } finally {
      setIsProcessingImage(false);
      event.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...photo,
      name: name.trim() || photo.name,
      type: type.trim() || photo.type,
      location: location.trim() || photo.location,
      imageUrl: imageUrl || photo.imageUrl,
      fileSize: imageSize || photo.fileSize,
      resolution: imageUrl !== photo.imageUrl ? 'Foto adjunta desde propiedades' : photo.resolution,
      elementType,
      cameraCode: elementType === 'camara' ? cameraCode : undefined,
      cameraType: elementType === 'camara' ? cameraType : undefined,
      acta: acta || undefined,
      tramo: elementType === 'tuberia' ? tramo.trim() || undefined : undefined,
      metraje: elementType === 'tuberia' ? metraje.trim() || undefined : undefined,
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
              className="w-full bg-[#f3faff] border border-[#c2c6d4] rounded-lg p-2.5 text-[14px] text-[#071e27] focus:border-[#004d99] focus:outline-none"
              required
            />
          </div>

          <div className="rounded-xl border border-[#b7d5e4] bg-[#f8fbfd] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-['Inter'] text-[13px] font-bold text-[#071e27]">Foto de evidencia</p>
                <p className="mt-0.5 text-[11px] text-[#607d8b]">Adjunta o reemplaza la fotografía del elemento desde sus propiedades.</p>
              </div>
              <span className="material-symbols-outlined text-[21px] text-[#0566aa]">add_a_photo</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-[#c2c6d4] bg-[#e6f6ff]">
                {imageUrl ? (
                  <img src={imageUrl} alt="Vista previa de la foto del elemento" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#527284]">
                    <span className="material-symbols-outlined text-[22px]">image</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isProcessingImage}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0566aa] bg-white px-3 text-[12px] font-bold text-[#004d99] transition hover:bg-[#e6f6ff] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[16px]">{isProcessingImage ? 'progress_activity' : 'upload'}</span>
                  {isProcessingImage ? 'Optimizando…' : imageUrl ? 'Reemplazar foto' : 'Adjuntar foto'}
                </button>
                <p className="mt-1.5 truncate text-[10px] text-[#607d8b]">{imageSize ? `Archivo original: ${imageSize}` : 'Se optimiza antes de guardarse.'}</p>
              </div>
            </div>
            {imageError && <p className="mt-2 text-[11px] font-medium text-[#ba1a1a]">{imageError}</p>}
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </div>

          <div>
            <label className="block font-['Inter'] font-bold text-[13px] text-[#071e27] mb-1">
              Estado de la Inspección
            </label>
            <div className="grid grid-cols-2 gap-2">
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
              className="w-full rounded-lg border border-[#c2c6d4] bg-white p-2.5 text-[14px] text-[#071e27] outline-none focus:border-[#004d99]"
            >
              <option value="">Sin acta asignada</option>
              {actas.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
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
            </div>
            {actaMessage && <p className="mt-2 text-[11px] font-medium text-[#075a91]" role="status">{actaMessage}</p>}
          </div>

          <div className="rounded-xl border border-[#c2c6d4] bg-[#f8fbfd] p-3">
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
                  onClick={() => setElementType(value)}
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
                    onClick={() => setCameraType(typeOption)}
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
