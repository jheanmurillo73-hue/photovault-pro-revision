/**
 * Diseño: cartografía técnica sobria. La ficha evita mezclar propiedades de
 * categorías distintas y comunica el alcance real del elemento seleccionado.
 */
import React, { useState } from 'react';
import { InspectionPhoto, getElementType } from '../types';

interface PhotoDetailViewProps {
  photo: InspectionPhoto;
  onBack: () => void;
  onBackToMap?: () => void;
  originTab?: string;
  onEdit: (photo: InspectionPhoto) => void;
  onDelete: (id: string) => void;
  onUpdatePhoto: (updated: InspectionPhoto) => void;
}

export const PhotoDetailView: React.FC<PhotoDetailViewProps> = ({
  photo,
  onBack,
  onBackToMap,
  originTab = 'dashboard',
  onEdit,
  onDelete,
  onUpdatePhoto,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  const handleToggleActionRequired = (value: boolean) => {
    onUpdatePhoto({
      ...photo,
      requiresImmediateAction: value,
      status: value ? 'Flagged' : 'Synced',
    });
  };

  const handleToggleVerified = () => {
    onUpdatePhoto({
      ...photo,
      verified: !photo.verified,
    });
  };

  const handleToggleExecutionStatus = (status: 'En proceso' | 'Terminado') => {
    onUpdatePhoto({
      ...photo,
      executionStatus: status,
    });
  };

  const handleCopyId = () => {
    navigator.clipboard?.writeText(photo.displayId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const currentExecutionStatus = photo.executionStatus || 'En proceso';
  const elementType = getElementType(photo);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#c2c6d4] shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Back to Map Button - Highlighted if coming from Map */}
          {onBackToMap && (
            <button
              type="button"
              onClick={onBackToMap}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg font-['Inter'] font-bold text-[13px] transition-all shadow-2xs ${
                originTab === 'map'
                  ? 'bg-[#004d99] hover:bg-[#003d7a] text-white ring-2 ring-[#004d99]/30'
                  : 'bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1a73e8] border border-[#1a73e8]/30'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">map</span>
              <span>Regresar al Mapa</span>
              {originTab === 'map' && (
                <span className="px-1.5 py-0.2 bg-white/20 text-white text-[10px] rounded-full uppercase tracking-wider font-mono">
                  Origen
                </span>
              )}
            </button>
          )}

          {/* Back to Dashboard / Gallery Button */}
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-['Inter'] font-semibold text-[13px] transition-colors ${
              originTab !== 'map'
                ? 'bg-[#004d99] hover:bg-[#003d7a] text-white'
                : 'bg-[#f3faff] hover:bg-[#cfe6f2] text-[#424752] border border-[#c2c6d4]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">grid_view</span>
            <span>Panel Principal / Galería</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#727783]">
          <span className="inline-flex items-center gap-1 bg-[#f3faff] px-2.5 py-1 rounded-md border border-[#c2c6d4]">
            <span className="material-symbols-outlined text-[15px] text-[#004d99]">location_city</span>
            Terminal A-12 / Registro de Inspecciones
          </span>
        </div>
      </div>

      {/* Main Content Layout: Large Photo Left + Properties Right */}
      <div className="flex flex-col lg:flex-row gap-4 w-full">
        {/* Left: Large Photo View */}
        <div className="flex-1 bg-[#f3faff] border border-[#c2c6d4] rounded-xl overflow-hidden flex flex-col shadow-xs relative group min-h-[480px] lg:min-h-[640px]">
          {/* Image Area */}
          <div className="flex-1 relative bg-[#e6f6ff] flex items-center justify-center p-4 overflow-hidden select-none">
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-200"
              style={{
                transform: `scale(${zoomLevel})`,
                cursor: zoomLevel > 1 ? 'grab' : 'default',
              }}
            >
              <img
                src={photo.imageUrl}
                alt={photo.name}
                className="w-full h-full object-contain max-h-[720px] rounded"
              />
            </div>

            {/* Image Overlay Controls */}
            <div className="absolute top-4 right-4 flex items-center gap-2 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[#f3faff]/80 backdrop-blur-xs p-1 rounded-full border border-[#c2c6d4]">
              <button
                type="button"
                onClick={handleZoomIn}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#071e27] hover:bg-[#cfe6f2] transition-colors"
                title="Acercar (Zoom In)"
              >
                <span className="material-symbols-outlined text-[18px]">zoom_in</span>
              </button>
              {zoomLevel > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#071e27] hover:bg-[#cfe6f2] transition-colors"
                    title="Alejar (Zoom Out)"
                  >
                    <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-2 h-8 rounded-full flex items-center justify-center text-[#071e27] hover:bg-[#cfe6f2] text-[11px] font-bold"
                    title="Restablecer Escala"
                  >
                    {zoomLevel}x
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#071e27] hover:bg-[#cfe6f2] transition-colors"
                title="Pantalla Completa"
              >
                <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              </button>
            </div>
          </div>

          {/* Context Bar */}
          <div className="p-4 border-t border-[#c2c6d4] bg-[#f3faff] flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                photo.status === 'Synced'
                  ? 'bg-[#a3f69c] ring-2 ring-[#a0f399]/50 animate-pulse'
                  : photo.status === 'Flagged'
                  ? 'bg-[#ffdad6] ring-2 ring-[#ba1a1a]/50'
                  : 'bg-[#cfe6f2]'
              }`}></span>
              <span className="font-['Inter'] font-bold text-[14px] text-[#424752]">
                {photo.status === 'Synced' ? 'Sincronizado en la Nube' : photo.status === 'Flagged' ? 'Inspección con Alerta' : 'Sincronización en Progreso'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyId}
              className="font-['Inter'] text-[14px] text-[#424752] hover:text-[#004d99] flex items-center gap-1.5 transition-colors"
              title="Copiar ID de Inspección"
            >
              <span>ID: {photo.displayId}</span>
              <span className="material-symbols-outlined text-[15px]">
                {copiedId ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Properties Panel */}
        <div className="w-full lg:w-96 bg-[#f3faff] border border-[#c2c6d4] rounded-xl shadow-xs flex flex-col h-fit flex-shrink-0">
          {/* Panel Header */}
          <div className="p-6 border-b border-[#c2c6d4] bg-white rounded-t-xl">
            <h1 className="font-['Hanken_Grotesk'] text-xl font-bold text-[#071e27] mb-3 leading-snug">
              {photo.name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Execution Status Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-['Inter'] font-bold text-[12px] ${
                  currentExecutionStatus === 'Terminado'
                    ? 'bg-[#a0f399] text-[#217128]'
                    : 'bg-[#fef3c7] text-[#92400e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {currentExecutionStatus === 'Terminado' ? 'task_alt' : 'pending_actions'}
                </span>
                {currentExecutionStatus}
              </span>

              {/* Verification Toggle Badge */}
              <button
                type="button"
                onClick={handleToggleVerified}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-['Inter'] font-medium text-[12px] transition-colors ${
                  photo.verified
                    ? 'bg-[#cfe6f2] text-[#004d99] hover:bg-[#b8dcf0]'
                    : 'bg-[#f0f2f5] text-[#727783] hover:bg-[#e4e7eb]'
                }`}
                title="Haz clic para alternar el estado de verificación"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {photo.verified ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                {photo.verified ? 'Verificado' : 'Sin Verificar'}
              </button>

              {/* Tramo Badge if defined */}
              {elementType === 'tuberia' && photo.tramo && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#004d99]/15 text-[#004d99] font-['Inter'] font-bold text-[12px] border border-[#004d99]/30">
                  <span className="material-symbols-outlined text-[14px]">plumbing</span>
                  Tramo: {photo.tramo}
                </span>
              )}

              {/* Metraje Badge if defined */}
              {elementType === 'tuberia' && photo.metraje && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1b6d24]/15 text-[#1b6d24] font-['Inter'] font-bold text-[12px] border border-[#1b6d24]/30">
                  <span className="material-symbols-outlined text-[14px]">straighten</span>
                  {photo.metraje} m
                </span>
              )}
            </div>
          </div>

          {/* Properties List (Inspection Style) */}
          <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
            {/* Section 1: Metadata */}
            <div className="space-y-3.5">
              <h3 className="font-['Inter'] font-medium text-[12px] text-[#727783] uppercase tracking-wider bg-[#cfe6f2] p-2 rounded-lg w-full">
                Metadatos y Propiedades
              </h3>

              {/* Property: Estado (En proceso / Terminado) */}
              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Estado
                </span>
                <div className="col-span-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleExecutionStatus('En proceso')}
                    className={`px-2.5 py-1 rounded text-[12px] font-bold transition-all flex items-center gap-1 ${
                      currentExecutionStatus === 'En proceso'
                        ? 'bg-[#f59e0b] text-white shadow-xs'
                        : 'bg-[#e6f6ff] text-[#424752] hover:bg-[#dbf1fe]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">pending_actions</span>
                    En proceso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleExecutionStatus('Terminado')}
                    className={`px-2.5 py-1 rounded text-[12px] font-bold transition-all flex items-center gap-1 ${
                      currentExecutionStatus === 'Terminado'
                        ? 'bg-[#16a34a] text-white shadow-xs'
                        : 'bg-[#e6f6ff] text-[#424752] hover:bg-[#dbf1fe]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    Terminado
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Tipo
                </span>
                <span className="col-span-2 font-['Inter'] text-[14px] text-[#071e27]">
                  {photo.type || photo.categoryLabel}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Fecha Captura
                </span>
                <span className="col-span-2 font-['Inter'] text-[14px] text-[#071e27]">
                  {photo.date}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Ubicación
                </span>
                <span className="col-span-2 font-['Inter'] text-[14px] text-[#071e27] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-[#004d99]">
                    location_on
                  </span>
                  <span className="truncate">{photo.location}</span>
                </span>
              </div>

              {elementType === 'camara' && (
                <>
              {/* Camera Model & System Type */}
              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Cámara
                </span>
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#004d99]/10 text-[#004d99] font-bold text-[12px] border border-[#004d99]/20">
                    <span className="material-symbols-outlined text-[14px]">videocam</span>
                    {photo.cameraCode || 'SB850'}
                  </span>
                  {photo.cameraType && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] ${
                      photo.cameraType === 'MT'
                        ? 'bg-sky-100 text-sky-800 border border-sky-300'
                        : photo.cameraType === 'BT'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-purple-100 text-purple-800 border border-purple-300'
                    }`}>
                      <span className="material-symbols-outlined text-[12px]">
                        {photo.cameraType === 'MT' ? 'bolt' : photo.cameraType === 'BT' ? 'electric_bolt' : 'lan'}
                      </span>
                      {photo.cameraType}
                    </span>
                  )}
                </div>
              </div>

                </>
              )}
              {elementType === 'tuberia' && (
                <>
              {/* Tramo / Tubería Property */}
              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Tramo Tubería
                </span>
                <div className="col-span-2 flex items-center gap-2">
                  {photo.tramo ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#004d99] text-white font-['Hanken_Grotesk'] font-bold text-[13px] shadow-xs">
                      <span className="material-symbols-outlined text-[15px]">plumbing</span>
                      {photo.tramo}
                    </span>
                  ) : (
                    <span className="text-[13px] text-[#727783] italic">
                      No especificado
                    </span>
                  )}
                </div>
              </div>

              {/* Metraje / Longitud Property */}
              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Metraje (Longitud)
                </span>
                <div className="col-span-2 flex items-center gap-2 flex-wrap">
                  {photo.metraje ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1b6d24] text-white font-['Hanken_Grotesk'] font-bold text-[13px] shadow-xs">
                        <span className="material-symbols-outlined text-[15px]">straighten</span>
                        {photo.metraje} metros
                      </span>
                      {photo.tramo && (
                        <span className="text-[12px] text-[#1b6d24] font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {(() => {
                            const match = photo.tramo.match(/^(\d+)x/);
                            const q = match ? parseInt(match[1], 10) : 1;
                            const m = parseFloat(String(photo.metraje));
                            if (q > 1 && !isNaN(m)) {
                              return `Total: ${(q * m).toFixed(1).replace(/\.0$/, '')} m lineales (${q} tubos × ${m}m)`;
                            }
                            return null;
                          })()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[13px] text-[#727783] italic">
                      No especificado
                    </span>
                  )}
                </div>
              </div>

                </>
              )}
              {/* Georreferenciación en Mapa */}
              <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Georreferenciación
                </span>
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#e6f6ff] text-[#004d99] font-mono text-[12px] border border-[#c2c6d4]">
                    <span className="material-symbols-outlined text-[14px]">my_location</span>
                    {photo.latitude && photo.longitude
                      ? `Lat: ${photo.latitude.toFixed(5)}, Lng: ${photo.longitude.toFixed(5)}`
                      : 'Coord. Predio Industrial (Auto)'}
                  </span>
                  {onBackToMap && (
                    <button
                      type="button"
                      onClick={onBackToMap}
                      className="px-2.5 py-1 bg-[#004d99] hover:bg-[#003870] text-white text-[11px] font-bold rounded-md flex items-center gap-1 shadow-2xs transition-colors"
                      title="Ver y centrar en el plano/mapa"
                    >
                      <span className="material-symbols-outlined text-[13px]">explore</span>
                      Ver en Mapa
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-start border-b border-[#c2c6d4] pb-3">
                <span className="col-span-1 font-['Inter'] font-bold text-[14px] text-[#424752] mt-1">
                  Inspector
                </span>
                <div className="col-span-2 flex items-center gap-2">
                  <img
                    src={photo.inspectorAvatar}
                    alt={photo.inspectorName}
                    className="w-6 h-6 rounded-full object-cover border border-[#c2c6d4]"
                  />
                  <span className="font-['Inter'] text-[14px] text-[#071e27]">
                    {photo.inspectorName} (ID: {photo.inspectorId})
                  </span>
                </div>
              </div>

              {photo.resolution && (
                <div className="grid grid-cols-3 gap-2 items-center border-b border-[#c2c6d4] pb-3 text-[12px] text-[#727783]">
                  <span className="col-span-1 font-bold">Detalles</span>
                  <span className="col-span-2">{photo.resolution} • {photo.fileSize}</span>
                </div>
              )}
            </div>

            {/* Section 2: Findings */}
            <div className="space-y-3.5">
              <h3 className="font-['Inter'] font-medium text-[12px] text-[#727783] uppercase tracking-wider bg-[#cfe6f2] p-2 rounded-lg w-full">
                Hallazgos y Observaciones
              </h3>

              <div className="flex flex-col gap-2">
                <label className="font-['Inter'] font-bold text-[14px] text-[#424752]">
                  Notas de Campo
                </label>
                <p className="font-['Inter'] text-[14px] leading-relaxed text-[#071e27] bg-[#e6f6ff] p-3.5 rounded-lg border border-[#c2c6d4] min-h-[80px]">
                  {photo.fieldNotes || 'Sin notas registradas en esta inspección.'}
                </p>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <label className="font-['Inter'] font-bold text-[14px] text-[#424752]">
                  ¿Requiere Acción Inmediata?
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => handleToggleActionRequired(true)}
                    className={`px-4 py-2 rounded font-['Inter'] font-bold text-[14px] transition-all ${
                      photo.requiresImmediateAction
                        ? 'bg-[#ba1a1a] text-white shadow-xs'
                        : 'bg-[#ECEFF1] border border-[#c2c6d4] text-[#424752] opacity-60 hover:opacity-100'
                    }`}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActionRequired(false)}
                    className={`px-4 py-2 rounded font-['Inter'] font-bold text-[14px] flex items-center gap-1 transition-all ${
                      !photo.requiresImmediateAction
                        ? 'bg-[#1b6d24] text-white shadow-xs'
                        : 'bg-[#ECEFF1] border border-[#c2c6d4] text-[#424752] opacity-60 hover:opacity-100'
                    }`}
                  >
                    {!photo.requiresImmediateAction && (
                      <span className="material-symbols-outlined text-[18px]">check</span>
                    )}
                    No
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Actions (Bottom Sticky) */}
          <div className="p-6 border-t border-[#c2c6d4] bg-white rounded-b-xl flex flex-col gap-2.5 mt-auto">
            {onBackToMap && (
              <button
                type="button"
                onClick={onBackToMap}
                className="w-full py-3 px-4 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#004d99] border border-[#004d99]/30 rounded-lg font-['Inter'] font-bold text-[14px] flex items-center justify-center gap-2 transition-colors shadow-2xs"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                {originTab === 'map' ? 'Regresar al Mapa de Obra' : 'Ver y Centrar en el Mapa'}
              </button>
            )}

            <button
              type="button"
              onClick={() => onEdit(photo)}
              className="w-full py-3 px-4 bg-[#004d99] text-white rounded-lg font-['Inter'] font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-[#1565c0] transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              Editar Detalles
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 px-4 bg-[#f3faff] text-[#ba1a1a] border border-[#ba1a1a]/40 rounded-lg font-['Inter'] font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-[#ffdad6] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Eliminar Foto
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center text-white pb-3 border-b border-white/20">
            <div>
              <h3 className="font-['Hanken_Grotesk'] font-bold text-lg">{photo.name}</h3>
              <p className="text-[12px] text-gray-300">{photo.displayId} • {photo.location}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="p-2 text-white hover:text-red-400 rounded-lg"
              title="Cerrar vista completa"
            >
              <span className="material-symbols-outlined text-[28px]">close</span>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={photo.imageUrl}
              alt={photo.name}
              className="max-w-full max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full border border-[#c2c6d4] shadow-2xl p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#ba1a1a] mb-3">
              <span className="material-symbols-outlined text-3xl">warning</span>
              <h3 className="font-['Hanken_Grotesk'] font-bold text-xl text-[#071e27]">
                ¿Eliminar Foto de Inspección?
              </h3>
            </div>
            <p className="text-[14px] text-[#424752] mb-4">
              ¿Estás seguro de que deseas eliminar permanentemente <strong>{photo.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-[#c2c6d4] text-[#424752] font-bold text-[13px] rounded-lg hover:bg-[#e6f6ff]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(photo.id);
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 bg-[#ba1a1a] text-white font-bold text-[13px] rounded-lg hover:bg-[#93000a]"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
