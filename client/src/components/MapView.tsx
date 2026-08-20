/**
 * Diseño: cartografía técnica sobria. El plano renderiza cajas, cámaras y
 * tuberías como capas independientes, con un único tipo visual por registro.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  InspectionPhoto,
  InspectorProfile,
  BlueprintOverlay,
  getElementType,
} from '../types';
import { DEFAULT_BLUEPRINT_SVG, SAMPLE_BLUEPRINTS } from '../data/blueprintTemplates';
import { ErrorBoundary } from './ErrorBoundary';
import { compressImageForDevice } from '../services/deviceStorageService';
import { isQuotaExceededError, loadBlueprintImage, saveBlueprintImage } from '../services/blueprintStorageService';

interface MapViewProps {
  photos: InspectionPhoto[];
  inspector: InspectorProfile;
  onSelectPhoto: (photo: InspectionPhoto) => void;
  onNavigateToUpload: () => void;
  onUpdatePhotoLocation?: (photoId: string, lat: number, lng: number) => void;
}

// Default reference coordinates (Industrial Plant Site)
const DEFAULT_CENTER = { lat: 4.6832, lng: -74.0886 };

// Helper to calculate offset coordinates based on meters and bearing
function getOffsetLatLng(lat: number, lng: number, distanceMeters: number, bearingDegrees: number) {
  const earthRadius = 6378137; // meters
  const dLat = (distanceMeters * Math.cos((bearingDegrees * Math.PI) / 180)) / earthRadius;
  const dLng = (distanceMeters * Math.sin((bearingDegrees * Math.PI) / 180)) / (earthRadius * Math.cos((lat * Math.PI) / 180));
  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  };
}

// Web Mercator math for built-in satellite & topological map engine
function latLngToPixel(lat: number, lng: number, zoom: number) {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function pixelToLatLng(x: number, y: number, zoom: number) {
  const scale = 256 * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

// Inner component for Google Maps GroundOverlay
function GoogleMapsGroundOverlay({ blueprint }: { blueprint: BlueprintOverlay }) {
  const map = useMap();
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null);

  useEffect(() => {
    if (!map || !window.google || !blueprint.visible || !blueprint.imageUrl) {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
      return;
    }

    try {
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(blueprint.bounds.south, blueprint.bounds.west),
        new google.maps.LatLng(blueprint.bounds.north, blueprint.bounds.east)
      );

      if (overlayRef.current) {
        overlayRef.current.setMap(null);
      }

      const overlay = new google.maps.GroundOverlay(blueprint.imageUrl, bounds, {
        opacity: blueprint.opacity,
        clickable: false,
      });

      overlay.setMap(map);
      overlayRef.current = overlay;

      return () => {
        if (overlayRef.current) {
          overlayRef.current.setMap(null);
          overlayRef.current = null;
        }
      };
    } catch (e) {
      console.warn('GroundOverlay initialization error:', e);
    }
  }, [map, blueprint.imageUrl, blueprint.opacity, blueprint.visible, blueprint.bounds]);

  return null;
}

// Inner component for Google Maps Polylines
function GoogleMapsTramosRenderer({
  photosWithCoords,
  onSelectPhoto,
}: {
  photosWithCoords: InspectionPhoto[];
  onSelectPhoto: (photo: InspectionPhoto) => void;
}) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map || !window.google) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    photosWithCoords.forEach((p) => {
      if (getElementType(p) !== 'tuberia' || !p.latitude || !p.longitude) return;

      const metrajeNum = typeof p.metraje === 'number' ? p.metraje : parseFloat(String(p.metraje || '0'));
      if (metrajeNum > 0) {
        const start = { lat: p.latitude, lng: p.longitude };
        const end = p.endLatitude && p.endLongitude
          ? { lat: p.endLatitude, lng: p.endLongitude }
          : getOffsetLatLng(p.latitude, p.longitude, metrajeNum, 90);

        const isMT = p.cameraType === 'MT';
        const color = isMT ? '#00e5ff' : '#f59e0b';

        const poly = new google.maps.Polyline({
          path: [start, end],
          geodesic: true,
          strokeColor: color,
          strokeOpacity: 0.95,
          strokeWeight: isMT ? 5 : 4,
          map: map,
        });

        poly.addListener('click', () => {
          onSelectPhoto(p);
        });

        polylinesRef.current.push(poly);
      }
    });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, photosWithCoords, onSelectPhoto]);

  return null;
}

// Interactive Built-in Georeferenced Satellite & Map Engine
function BuiltinGeoreferencedMap({
  center,
  zoom,
  blueprint,
  photos,
  inspectorLocation,
  inspector,
  mapType,
  onSelectPhoto,
  onCenterChange,
  onZoomChange,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  blueprint: BlueprintOverlay;
  photos: InspectionPhoto[];
  inspectorLocation: { lat: number; lng: number; isLive: boolean; accuracy?: number };
  inspector: InspectorProfile;
  mapType: 'satellite' | 'streets' | 'topo';
  onSelectPhoto: (photo: InspectionPhoto) => void;
  onCenterChange: (center: { lat: number; lng: number }) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; center: { lat: number; lng: number } }>({
    x: 0,
    y: 0,
    center,
  });

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 1200,
          height: entry.contentRect.height || 800,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute tile URLs
  const tiles = useMemo(() => {
    const halfW = dimensions.width / 2;
    const halfH = dimensions.height / 2;
    const centerPix = latLngToPixel(center.lat, center.lng, zoom);

    const minX = Math.floor((centerPix.x - halfW) / 256);
    const maxX = Math.floor((centerPix.x + halfW) / 256);
    const minY = Math.floor((centerPix.y - halfH) / 256);
    const maxY = Math.floor((centerPix.y + halfH) / 256);

    const maxTilesAtZoom = Math.pow(2, zoom);
    const tileList: Array<{ x: number; y: number; z: number; left: number; top: number; url: string; key: string }> = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= maxTilesAtZoom) continue;
        const wrappedX = ((x % maxTilesAtZoom) + maxTilesAtZoom) % maxTilesAtZoom;

        const tileLeft = x * 256 - (centerPix.x - halfW);
        const tileTop = y * 256 - (centerPix.y - halfH);

        let url = '';
        if (mapType === 'satellite') {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${wrappedX}`;
        } else if (mapType === 'streets') {
          url = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
        } else {
          url = `https://a.tile.opentopomap.org/${zoom}/${wrappedX}/${y}.png`;
        }

        tileList.push({
          x: wrappedX,
          y,
          z: zoom,
          left: tileLeft,
          top: tileTop,
          url,
          key: `${zoom}-${x}-${y}-${mapType}`,
        });
      }
    }
    return tileList;
  }, [center, zoom, dimensions, mapType]);

  // Convert lat/lng to container pixel coordinates
  const getScreenCoords = useCallback(
    (lat: number, lng: number) => {
      const centerPix = latLngToPixel(center.lat, center.lng, zoom);
      const targetPix = latLngToPixel(lat, lng, zoom);
      const screenX = targetPix.x - centerPix.x + dimensions.width / 2;
      const screenY = targetPix.y - centerPix.y + dimensions.height / 2;
      return { x: screenX, y: screenY };
    },
    [center, zoom, dimensions]
  );

  // Blueprint overlay coordinates
  const blueprintScreen = useMemo(() => {
    if (!blueprint.visible || !blueprint.imageUrl) return null;
    const nw = getScreenCoords(blueprint.bounds.north, blueprint.bounds.west);
    const se = getScreenCoords(blueprint.bounds.south, blueprint.bounds.east);

    return {
      left: nw.x,
      top: nw.y,
      width: Math.max(20, se.x - nw.x),
      height: Math.max(20, se.y - nw.y),
    };
  }, [blueprint, getScreenCoords]);

  // Inspector Screen Position
  const inspectorScreen = useMemo(() => {
    return getScreenCoords(inspectorLocation.lat, inspectorLocation.lng);
  }, [inspectorLocation, getScreenCoords]);

  // Mouse / Touch handlers for dragging map
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.interactive-marker')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, center });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const centerPix = latLngToPixel(dragStart.center.lat, dragStart.center.lng, zoom);
    const newCenterPix = { x: centerPix.x - dx, y: centerPix.y - dy };
    const newCenter = pixelToLatLng(newCenterPix.x, newCenterPix.y, zoom);
    onCenterChange(newCenter);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      if (zoom < 20) onZoomChange(zoom + 1);
    } else {
      if (zoom > 14) onZoomChange(zoom - 1);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing bg-[#091829]"
    >
      {/* Map Tile Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            loading="eager"
            className="absolute transition-opacity duration-150"
            style={{
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              width: '256px',
              height: '256px',
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
            }}
          />
        ))}
      </div>

      {/* Blueprint Ground Overlay */}
      {blueprint.visible && blueprintScreen && (
        <div
          className="absolute pointer-events-none transition-all duration-75 z-10"
          style={{
            left: `${blueprintScreen.left}px`,
            top: `${blueprintScreen.top}px`,
            width: `${blueprintScreen.width}px`,
            height: `${blueprintScreen.height}px`,
            opacity: blueprint.opacity,
          }}
        >
          <img
            src={blueprint.imageUrl}
            alt={blueprint.name}
            className="w-full h-full object-fill border border-cyan-400/50 rounded-xs shadow-2xl"
          />
        </div>
      )}

      {/* SVG Vector Layer for Tramos & Pipelines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-15">
        <defs>
          <linearGradient id="mtGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00e5ff" />
            <stop offset="100%" stopColor="#1a73e8" />
          </linearGradient>
          <linearGradient id="btGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffb300" />
            <stop offset="100%" stopColor="#ea4335" />
          </linearGradient>
        </defs>

        {photos.map((photo) => {
          if (getElementType(photo) !== 'tuberia' || !photo.latitude || !photo.longitude) return null;
          const start = getScreenCoords(photo.latitude, photo.longitude);
          const metrajeNum = typeof photo.metraje === 'number' ? photo.metraje : parseFloat(String(photo.metraje || '0'));
          if (metrajeNum <= 0) return null;

          const endCoords = photo.endLatitude && photo.endLongitude
            ? { lat: photo.endLatitude, lng: photo.endLongitude }
            : getOffsetLatLng(photo.latitude, photo.longitude, metrajeNum, 90);
          const end = getScreenCoords(endCoords.lat, endCoords.lng);

          const isMT = photo.cameraType === 'MT';

          return (
            <g key={`pipe-${photo.id}`}>
              {/* Outer Glow */}
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={isMT ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255, 179, 0, 0.35)'}
                strokeWidth={isMT ? 10 : 8}
                strokeLinecap="round"
              />
              {/* Main Pipe Conduit Line */}
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={isMT ? 'url(#mtGrad)' : 'url(#btGrad)'}
                strokeWidth={isMT ? 5 : 4}
                strokeLinecap="round"
              />
              {/* Midpoint metraje label */}
              <g transform={`translate(${(start.x + end.x) / 2}, ${(start.y + end.y) / 2 - 12})`}>
                <rect
                  x="-38"
                  y="-11"
                  width="76"
                  height="22"
                  rx="11"
                  fill="#202124"
                  fillOpacity="0.9"
                  stroke={isMT ? '#00e5ff' : '#f59e0b'}
                  strokeWidth="1.2"
                />
                <text
                  x="0"
                  y="4"
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="'Roboto', sans-serif"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {photo.metraje}m {photo.tramo ? `(${photo.tramo})` : ''}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Inspector Live Position Marker */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto"
        style={{ left: `${inspectorScreen.x}px`, top: `${inspectorScreen.y}px` }}
      >
        <div className="relative flex flex-col items-center group cursor-pointer">
          <div className="absolute -inset-3 bg-[#1a73e8]/30 rounded-full animate-ping pointer-events-none" />
          <div className="w-10 h-10 rounded-full border-2 border-white bg-[#1a73e8] shadow-xl overflow-hidden flex items-center justify-center z-10 ring-2 ring-[#4285f4]">
            <img src={inspector.avatarUrl} alt={inspector.name} className="w-full h-full object-cover" />
          </div>
          <div className="mt-1 px-2.5 py-0.5 bg-[#202124] text-white text-[11px] font-['Google_Sans',Roboto,sans-serif] font-medium rounded-full shadow-md whitespace-nowrap border border-white/30">
            Inspector: {inspector.name.split(' ')[0]}
          </div>
        </div>
      </div>

      {/* Box Markers for Inspection Photos */}
      {photos.map((photo) => {
        const elementType = getElementType(photo);
        if (elementType === 'tuberia' || !photo.latitude || !photo.longitude) return null;
        const pos = getScreenCoords(photo.latitude, photo.longitude);
        const isCamera = elementType === 'camara';
        const isMT = isCamera && photo.cameraType === 'MT';
        const isBT = isCamera && photo.cameraType === 'BT';
        const isTerminado = photo.executionStatus === 'Terminado';

        return (
          <div
            key={photo.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPhoto(photo);
            }}
            className="interactive-marker absolute -translate-x-1/2 -translate-y-1/2 z-25 cursor-pointer group hover:scale-110 transition-transform"
            style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
          >
            {/* Status dot */}
            <div
              className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white z-20 ${
                isTerminado ? 'bg-[#34a853]' : 'bg-[#fbbc04]'
              }`}
            />

            {/* Google Maps Pin Pill */}
            <div
              className={`px-3 py-1.5 rounded-full shadow-xl border border-white/60 font-['Google_Sans',Roboto,sans-serif] font-semibold text-[11px] text-white flex items-center gap-1.5 ${
                isCamera ? (isMT ? 'bg-[#1a73e8]' : isBT ? 'bg-[#ea4335]' : 'bg-[#00897b]') : 'bg-[#d97706]'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isCamera ? 'videocam' : 'inventory_2'}
              </span>
              <span>{isCamera ? photo.cameraCode || 'Cámara' : 'Caja'}</span>
            </div>

          </div>
        );
      })}
    </div>
  );
}

export const MapView: React.FC<MapViewProps> = ({
  photos,
  inspector,
  onSelectPhoto,
  onNavigateToUpload,
}) => {
  // Google Maps API Key state (saved in localStorage or .env)
  const envKey = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(() => {
    return localStorage.getItem('photovault_google_maps_key') || envKey;
  });

  // Map Provider Mode: 'builtin' (Zero error Satellite engine) vs 'google' (Official Google Maps if key provided)
  const [activeEngine, setActiveEngine] = useState<'builtin' | 'google'>(() => {
    return googleMapsApiKey.trim().length > 10 ? 'google' : 'builtin';
  });

  const [mapLayerType, setMapLayerType] = useState<'satellite' | 'streets' | 'topo'>('satellite');
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [inputApiKey, setInputApiKey] = useState<string>(googleMapsApiKey);

  // Inspector Live Geolocation state
  const [inspectorLocation, setInspectorLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp?: number;
    isLive: boolean;
  }>({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    accuracy: 5,
    isLive: false,
  });

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(18);
  const [selectedMarkerPhoto, setSelectedMarkerPhoto] = useState<InspectionPhoto | null>(null);

  // Fullscreen container state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Search and Floating Menu states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState<boolean>(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  // Blueprint Layer state
  const [blueprint, setBlueprint] = useState<BlueprintOverlay>(() => {
    const saved = localStorage.getItem('photovault_blueprint');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BlueprintOverlay;
        return {
          ...parsed,
          imageUrl: parsed.imageUrl || DEFAULT_BLUEPRINT_SVG,
        };
      } catch {
        // fallback
      }
    }
    return {
      id: 'bp-default',
      name: 'Plano General Subestación y Tuberías MT/BT',
      imageUrl: DEFAULT_BLUEPRINT_SVG,
      opacity: 0.7,
      visible: true,
      bounds: {
        north: DEFAULT_CENTER.lat + 0.0012,
        south: DEFAULT_CENTER.lat - 0.0012,
        east: DEFAULT_CENTER.lng + 0.0018,
        west: DEFAULT_CENTER.lng - 0.0018,
      },
      rotation: 0,
      scale: 1,
    };
  });

  // Layer Popover / Panel state (Bottom Left "Capas" button)
  const [isLayersModalOpen, setIsLayersModalOpen] = useState<boolean>(false);
  const [isBlueprintLocked, setIsBlueprintLocked] = useState<boolean>(false);
  const [blueprintStorageNotice, setBlueprintStorageNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blueprintStorageReadyRef = useRef(false);

  // Restore the full blueprint image from IndexedDB and migrate any previous localStorage image.
  useEffect(() => {
    let isActive = true;
    const restoreBlueprintImage = async () => {
      try {
        const indexedImage = await loadBlueprintImage();
        if (indexedImage && isActive) {
          setBlueprint((prev) => ({ ...prev, imageUrl: indexedImage }));
          return;
        }

        const storedMetadata = localStorage.getItem('photovault_blueprint');
        const legacyBlueprint = storedMetadata ? (JSON.parse(storedMetadata) as BlueprintOverlay) : null;
        const legacyImage = legacyBlueprint?.imageUrl;

        if (legacyImage && legacyImage !== DEFAULT_BLUEPRINT_SVG) {
          await saveBlueprintImage(legacyImage);
          localStorage.setItem('photovault_blueprint', JSON.stringify({ ...legacyBlueprint, imageUrl: '' }));
        }
      } catch {
        // A browser without IndexedDB can still display and use the current session's plan.
      } finally {
        blueprintStorageReadyRef.current = true;
      }
    };

    void restoreBlueprintImage();

    return () => {
      isActive = false;
    };
  }, []);

  // Store only lightweight plane metadata in localStorage. The image itself is kept in IndexedDB.
  useEffect(() => {
    if (!blueprintStorageReadyRef.current) return;

    const persistBlueprint = async () => {
      const { imageUrl, ...metadata } = blueprint;

      try {
        localStorage.setItem('photovault_blueprint', JSON.stringify({ ...metadata, imageUrl: '' }));
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setBlueprintStorageNotice('El plano sigue abierto, pero sus ajustes no se pudieron guardar en el almacenamiento local.');
        }
      }

      try {
        await saveBlueprintImage(imageUrl);
        setBlueprintStorageNotice(null);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setBlueprintStorageNotice('El plano es demasiado grande para el almacenamiento disponible. Se mantiene abierto durante esta sesión.');
        } else {
          setBlueprintStorageNotice('No se pudo conservar el plano para la próxima sesión; el mapa continúa disponible.');
        }
      }
    };

    void persistBlueprint();
  }, [blueprint]);

  // Request Inspector Geolocation on mount and watch
  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
            isLive: true,
          };
          setInspectorLocation(newPos);
        },
        (err) => {
          console.warn('Geolocation access fallback:', err.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000,
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, []);

  // Compute georeferenced photos
  const georeferencedPhotos = useMemo(() => {
    return photos.map((p, index) => {
      if (p.latitude && p.longitude) {
        return p;
      }
      const offsetIndex = index + 1;
      const angle = (index * 60) % 360;
      const distance = 15 + (offsetIndex * 14);
      const coords = getOffsetLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, distance, angle);
      
      const metrajeNum = typeof p.metraje === 'number' ? p.metraje : parseFloat(String(p.metraje || '15'));
      const endCoords = getOffsetLatLng(coords.lat, coords.lng, metrajeNum || 15, (angle + 45) % 360);

      return {
        ...p,
        latitude: coords.lat,
        longitude: coords.lng,
        endLatitude: endCoords.lat,
        endLongitude: endCoords.lng,
      };
    });
  }, [photos]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    return georeferencedPhotos.filter((p) => {
      if (activeCategoryFilter === 'MT' && p.cameraType !== 'MT') return false;
      if (activeCategoryFilter === 'BT' && p.cameraType !== 'BT') return false;
      if (activeCategoryFilter === 'Terminado' && p.executionStatus !== 'Terminado') return false;
      if (activeCategoryFilter === 'En proceso' && p.executionStatus !== 'En proceso') return false;
      if (activeCategoryFilter === 'SB850' && p.cameraCode !== 'SB850') return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesLoc = p.location.toLowerCase().includes(q);
        const matchesCam = (p.cameraCode || '').toLowerCase().includes(q);
        const matchesTramo = (p.tramo || '').toLowerCase().includes(q);
        const matchesMetraje = String(p.metraje || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLoc && !matchesCam && !matchesTramo && !matchesMetraje) {
          return false;
        }
      }
      return true;
    });
  }, [georeferencedPhotos, activeCategoryFilter, searchQuery]);

  // Calculations for summary stats
  const totalMeters = useMemo(() => {
    return filteredPhotos.reduce((acc, curr) => {
      const m = typeof curr.metraje === 'number' ? curr.metraje : parseFloat(String(curr.metraje || '0'));
      return acc + (isNaN(m) ? 0 : m);
    }, 0);
  }, [filteredPhotos]);

  // Save API Key handler
  const handleSaveApiKey = () => {
    const trimmed = inputApiKey.trim();
    localStorage.setItem('photovault_google_maps_key', trimmed);
    setGoogleMapsApiKey(trimmed);
    if (trimmed.length > 10) {
      setActiveEngine('google');
    }
    setShowApiKeyModal(false);
  };

  // Center on Inspector location
  const handleCenterOnInspector = () => {
    setMapCenter({
      lat: inspectorLocation.lat,
      lng: inspectorLocation.lng,
    });
    setMapZoom(19);
  };

  // Center on Blueprint
  const handleCenterOnBlueprint = () => {
    const centerLat = (blueprint.bounds.north + blueprint.bounds.south) / 2;
    const centerLng = (blueprint.bounds.east + blueprint.bounds.west) / 2;
    setMapCenter({ lat: centerLat, lng: centerLng });
    setMapZoom(18);
  };

  // Upload Custom Blueprint file
  const handleBlueprintUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBlueprintStorageNotice('Selecciona una imagen de plano válida en formato JPG, PNG, WEBP o similar.');
      return;
    }

    setBlueprintStorageNotice('Optimizando el plano para cargarlo con seguridad…');
    try {
      const optimizedImage = await compressImageForDevice(file, 2048, 1536, 0.82);
      setBlueprint((prev) => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, ''),
        imageUrl: optimizedImage,
        visible: true,
        bounds: {
          north: mapCenter.lat + 0.0012,
          south: mapCenter.lat - 0.0012,
          east: mapCenter.lng + 0.0018,
          west: mapCenter.lng - 0.0018,
        },
      }));
      e.target.value = '';
    } catch {
      setBlueprintStorageNotice('No se pudo procesar esta imagen. Intenta con otro archivo de plano.');
    }
  };

  // Adjust blueprint bounds
  const adjustBlueprintBounds = (deltaNorth: number, deltaEast: number, scaleFactor: number = 1) => {
    if (isBlueprintLocked) return;
    setBlueprint((prev) => {
      const centerLat = (prev.bounds.north + prev.bounds.south) / 2 + deltaNorth;
      const centerLng = (prev.bounds.east + prev.bounds.west) / 2 + deltaEast;
      const halfHeight = ((prev.bounds.north - prev.bounds.south) / 2) * scaleFactor;
      const halfWidth = ((prev.bounds.east - prev.bounds.west) / 2) * scaleFactor;

      return {
        ...prev,
        bounds: {
          north: centerLat + halfHeight,
          south: centerLat - halfHeight,
          east: centerLng + halfWidth,
          west: centerLng - halfWidth,
        },
      };
    });
  };

  const hasValidGoogleKey = googleMapsApiKey.trim().length > 10;

  return (
    <div
      className={`w-full h-full relative overflow-hidden font-['Roboto',sans-serif] select-none ${
        isFullscreen ? 'fixed inset-0 z-50 bg-[#202124]' : 'relative'
      }`}
    >
      {blueprintStorageNotice && (
        <div className="absolute right-3 top-3 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2.5 text-[12px] text-amber-900 shadow-lg backdrop-blur-sm">
          <span className="material-symbols-outlined mt-0.5 text-[18px] text-amber-700">info</span>
          <span>{blueprintStorageNotice}</span>
          <button
            type="button"
            onClick={() => setBlueprintStorageNotice(null)}
            className="ml-1 rounded p-0.5 text-amber-800 hover:bg-amber-100"
            aria-label="Cerrar aviso de almacenamiento"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}
      {/* ----------------- GOOGLE MAPS FLOATING TOP BAR & SEARCH CARD ----------------- */}
      <div className="absolute top-3 left-3 z-30 flex flex-col md:flex-row items-start gap-2.5 max-w-[calc(100vw-24px)] pointer-events-auto">
        {/* Floating Google Maps Search Card */}
        <div className="relative w-[360px] sm:w-[390px] max-w-full">
          <div className="flex items-center h-12 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2),0_-1px_0px_rgba(0,0,0,0.02)] px-3 border border-transparent hover:shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition-all">
            {/* Left Menu Icon */}
            <button
              type="button"
              onClick={() => setIsSearchMenuOpen(!isSearchMenuOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
              title="Menú de ubicaciones"
            >
              <span className="material-symbols-outlined text-[22px]">menu</span>
            </button>

            {/* Input Field with Google Maps typography */}
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchMenuOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en el plano, cámaras o tramos..."
              className="flex-1 px-2.5 text-[15px] font-['Google_Sans',Roboto,sans-serif] text-[#202124] placeholder-[#5f6368] outline-none bg-transparent"
            />

            {/* Clear Button if input exists */}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#70757a] hover:bg-[#f1f3f4] mr-1"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}

            {/* Search Icon */}
            <button
              type="button"
              onClick={() => setIsSearchMenuOpen(!isSearchMenuOpen)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
              title="Buscar"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>

            <div className="w-[1px] h-6 bg-[#dadce0] mx-1.5" />

            {/* Google Maps Blue Route / Directions Button */}
            <button
              type="button"
              onClick={handleCenterOnInspector}
              className="w-9 h-9 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white flex items-center justify-center shadow-sm transition-all"
              title="Ir a mi ubicación en vivo (GPS)"
            >
              <span className="material-symbols-outlined text-[20px]">directions</span>
            </button>
          </div>

          {/* Google Maps Styled Dropdown / Recents Panel */}
          {isSearchMenuOpen && (
            <div className="absolute top-14 left-0 w-full bg-white rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.2)] border border-[#dadce0] overflow-hidden py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-150 font-['Google_Sans',Roboto,sans-serif]">
              {/* Home Item */}
              <div
                onClick={() => {
                  handleCenterOnBlueprint();
                  setIsSearchMenuOpen(false);
                }}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#f8f9fa] cursor-pointer border-b border-[#f1f3f4]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">home</span>
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-[#202124]">Subestación Central</div>
                    <div className="text-[12px] text-[#70757a]">Planta Principal de Obra</div>
                  </div>
                </div>
                <span className="text-[12px] font-medium text-[#1a73e8] hover:underline">
                  Ver Plano
                </span>
              </div>

              {/* Recent / Suggested cameras list matching user screenshot style */}
              <div className="py-1">
                {photos.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectPhoto(p);
                      if (p.latitude && p.longitude) {
                        setMapCenter({ lat: p.latitude, lng: p.longitude });
                        setMapZoom(19);
                      }
                      setIsSearchMenuOpen(false);
                    }}
                    className="flex items-center gap-3.5 px-4 py-2.5 hover:bg-[#f1f3f4] cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[#70757a] text-[20px]">
                      history
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] text-[#202124] truncate font-medium">
                        {p.cameraCode || 'Cámara'} - {p.name}
                      </div>
                      <div className="text-[12px] text-[#70757a] truncate">
                        {p.tramo ? `Tramo ${p.tramo} (${p.metraje || '0'}m)` : p.location}
                        <span className={`ml-2 font-medium ${p.cameraType === 'MT' ? 'text-[#1a73e8]' : 'text-[#ea4335]'}`}>
                          • Red {p.cameraType || 'MT'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Inspector Live Position Shortcut */}
                <div
                  onClick={() => {
                    handleCenterOnInspector();
                    setIsSearchMenuOpen(false);
                  }}
                  className="flex items-center gap-3.5 px-4 py-2.5 hover:bg-[#f1f3f4] cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[#1a73e8] text-[20px]">
                    my_location
                  </span>
                  <div className="flex-1">
                    <div className="text-[14px] text-[#1a73e8] font-medium">
                      Inspector: {inspector.name}
                    </div>
                    <div className="text-[12px] text-[#70757a]">
                      GPS Activo en tiempo real • Precisión ±{inspectorLocation.accuracy || 5}m
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom footer button */}
              <div className="px-4 pt-2 pb-1 border-t border-[#f1f3f4] text-center">
                <button
                  type="button"
                  onClick={() => setIsSearchMenuOpen(false)}
                  className="text-[13px] font-medium text-[#1a73e8] hover:underline"
                >
                  Cerrar sugerencias
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Floating Google Maps Horizontal Category Chips (Restaurantes, Hoteles -> Cámaras MT, BT, Tramos, Plano) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full">
          {/* Chip: Red MT */}
          <button
            type="button"
            onClick={() => setActiveCategoryFilter(activeCategoryFilter === 'MT' ? 'all' : 'MT')}
            className={`h-9 px-3.5 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] text-[13px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95 ${
              activeCategoryFilter === 'MT'
                ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#dadce0]'
                : 'bg-white text-[#3c4043] hover:bg-[#f1f3f4] border border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-[#1a73e8]">
              electrical_services
            </span>
            <span>Redes MT</span>
          </button>

          {/* Chip: Red BT */}
          <button
            type="button"
            onClick={() => setActiveCategoryFilter(activeCategoryFilter === 'BT' ? 'all' : 'BT')}
            className={`h-9 px-3.5 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] text-[13px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95 ${
              activeCategoryFilter === 'BT'
                ? 'bg-[#fce8e6] text-[#c5221f] border border-[#dadce0]'
                : 'bg-white text-[#3c4043] hover:bg-[#f1f3f4] border border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-[#ea4335]">
              power
            </span>
            <span>Redes BT</span>
          </button>

          {/* Chip: Capa de Plano con Transparencia */}
          <button
            type="button"
            onClick={() => setIsLayersModalOpen(true)}
            className="h-9 px-3.5 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] bg-white text-[#3c4043] hover:bg-[#f1f3f4] text-[13px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95 border border-transparent"
          >
            <span className="material-symbols-outlined text-[18px] text-[#1a73e8]">
              architecture
            </span>
            <span>Plano de Obra</span>
            <span className="px-1.5 py-0.5 rounded bg-[#e8f0fe] text-[#1a73e8] text-[11px] font-bold font-mono">
              {Math.round(blueprint.opacity * 100)}%
            </span>
          </button>

          {/* Chip: Terminados */}
          <button
            type="button"
            onClick={() => setActiveCategoryFilter(activeCategoryFilter === 'Terminado' ? 'all' : 'Terminado')}
            className={`h-9 px-3.5 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] text-[13px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95 ${
              activeCategoryFilter === 'Terminado'
                ? 'bg-[#e6f4ea] text-[#137333] border border-[#dadce0]'
                : 'bg-white text-[#3c4043] hover:bg-[#f1f3f4] border border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-[#34a853]">
              check_circle
            </span>
            <span>Terminados</span>
          </button>

          {/* Chip: Registrar Caja Fotográfica */}
          <button
            type="button"
            onClick={onNavigateToUpload}
            className="h-9 px-3.5 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] bg-[#1a73e8] text-white hover:bg-[#1557b0] text-[13px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
            <span>Nueva Caja</span>
          </button>

          {/* Map Engine Toggle Chip */}
          <button
            type="button"
            onClick={() => {
              if (activeEngine === 'builtin') {
                if (hasValidGoogleKey) {
                  setActiveEngine('google');
                } else {
                  setShowApiKeyModal(true);
                }
              } else {
                setActiveEngine('builtin');
              }
            }}
            className="h-9 px-3 rounded-full shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] bg-white text-[#3c4043] hover:bg-[#f1f3f4] text-[12px] font-['Google_Sans',Roboto,sans-serif] font-medium flex items-center gap-1.5 transition-all whitespace-nowrap border border-transparent"
            title="Alternar entre Satélite HD y Google Maps API"
          >
            <span className="material-symbols-outlined text-[16px] text-[#5f6368]">
              settings
            </span>
            <span>{activeEngine === 'google' ? 'Google Maps' : 'Satélite HD'}</span>
          </button>
        </div>
      </div>

      {/* ----------------- MAIN FULLSCREEN MAP VIEW CANVAS ----------------- */}
      <div className="w-full h-full relative">
        {activeEngine === 'google' && hasValidGoogleKey ? (
          <ErrorBoundary
            fallback={
              <BuiltinGeoreferencedMap
                center={mapCenter}
                zoom={mapZoom}
                blueprint={blueprint}
                photos={filteredPhotos}
                inspectorLocation={inspectorLocation}
                inspector={inspector}
                mapType={mapLayerType}
                onSelectPhoto={onSelectPhoto}
                onCenterChange={setMapCenter}
                onZoomChange={setMapZoom}
              />
            }
          >
            <APIProvider apiKey={googleMapsApiKey}>
              <Map
                defaultCenter={DEFAULT_CENTER}
                center={mapCenter}
                defaultZoom={18}
                zoom={mapZoom}
                className="w-full h-full"
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                mapTypeId="hybrid"
              >
                {blueprint.visible && <GoogleMapsGroundOverlay blueprint={blueprint} />}
                <GoogleMapsTramosRenderer
                  photosWithCoords={filteredPhotos}
                  onSelectPhoto={(p) => onSelectPhoto(p)}
                />
                <AdvancedMarker position={{ lat: inspectorLocation.lat, lng: inspectorLocation.lng }}>
                  <div className="relative flex flex-col items-center group cursor-pointer">
                    <div className="absolute -inset-2 bg-blue-500/20 rounded-full animate-ping pointer-events-none" />
                    <div className="w-10 h-10 rounded-full border-2 border-white bg-[#1a73e8] shadow-lg overflow-hidden flex items-center justify-center z-10 ring-2 ring-blue-400">
                      <img src={inspector.avatarUrl} alt={inspector.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="mt-1 px-2 py-0.5 bg-[#202124] text-white text-[10px] font-['Google_Sans',Roboto,sans-serif] font-bold rounded-full shadow-md whitespace-nowrap border border-white/40">
                      Inspector: {inspector.name.split(' ')[0]}
                    </div>
                  </div>
                </AdvancedMarker>
                {filteredPhotos.map((photo) => {
                  const elementType = getElementType(photo);
                  if (elementType === 'tuberia' || !photo.latitude || !photo.longitude) return null;
                  const isCamera = elementType === 'camara';
                  const isMT = isCamera && photo.cameraType === 'MT';
                  const isBT = isCamera && photo.cameraType === 'BT';
                  const isTerminado = photo.executionStatus === 'Terminado';
                  const badgeColor = isCamera ? (isMT ? 'bg-[#1a73e8] text-white' : isBT ? 'bg-[#ea4335] text-white' : 'bg-[#00897b] text-white') : 'bg-[#d97706] text-white';
                  return (
                    <AdvancedMarker
                      key={photo.id}
                      position={{ lat: photo.latitude, lng: photo.longitude }}
                      onClick={() => setSelectedMarkerPhoto(photo)}
                    >
                      <div className="relative flex flex-col items-center group cursor-pointer hover:scale-110 transition-transform">
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white z-20 ${isTerminado ? 'bg-[#34a853]' : 'bg-[#fbbc04]'}`} />
                        <div className={`px-2.5 py-1 rounded-full shadow-lg border border-white/80 font-bold text-[11px] font-['Google_Sans',Roboto,sans-serif] flex items-center gap-1 z-10 ${badgeColor}`}>
                          <span className="material-symbols-outlined text-[14px]">{isCamera ? 'videocam' : 'inventory_2'}</span>
                          <span>{isCamera ? photo.cameraCode || 'Cámara' : 'Caja'}</span>
                        </div>
                      </div>
                    </AdvancedMarker>
                  );
                })}
                {selectedMarkerPhoto && selectedMarkerPhoto.latitude && selectedMarkerPhoto.longitude && (
                  <InfoWindow
                    position={{ lat: selectedMarkerPhoto.latitude, lng: selectedMarkerPhoto.longitude }}
                    onCloseClick={() => setSelectedMarkerPhoto(null)}
                  >
                    <div className="p-1 max-w-xs font-['Google_Sans',Roboto,sans-serif]">
                      <div className="flex items-center gap-2 mb-2">
                        {getElementType(selectedMarkerPhoto) === 'camara' ? (
                          <>
                            <span className="px-2 py-0.5 rounded-full bg-[#1a73e8] text-white text-[11px] font-bold">
                              {selectedMarkerPhoto.cameraCode || 'Cámara'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#e8f0fe] text-[#1a73e8] text-[10px] font-bold">
                              Tipo {selectedMarkerPhoto.cameraType || 'MT'}
                            </span>
                          </>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[11px] font-bold">
                            Caja
                          </span>
                        )}
                      </div>
                      {selectedMarkerPhoto.imageUrl && (
                        <div className="w-full h-32 rounded-xl overflow-hidden mb-2 bg-slate-100 relative">
                          <img src={selectedMarkerPhoto.imageUrl} alt={selectedMarkerPhoto.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <h4 className="font-bold text-[#202124] text-[13px] leading-tight">{selectedMarkerPhoto.name}</h4>
                      <p className="text-[11px] text-[#5f6368] mt-0.5">{selectedMarkerPhoto.location}</p>
                      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-[#dadce0]">
                        <button
                          type="button"
                          onClick={() => onSelectPhoto(selectedMarkerPhoto)}
                          className="w-full py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-[11px] font-medium rounded-full shadow-sm"
                        >
                          Ver Detalle Completo
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Map>
            </APIProvider>
          </ErrorBoundary>
        ) : (
          <BuiltinGeoreferencedMap
            center={mapCenter}
            zoom={mapZoom}
            blueprint={blueprint}
            photos={filteredPhotos}
            inspectorLocation={inspectorLocation}
            inspector={inspector}
            mapType={mapLayerType}
            onSelectPhoto={onSelectPhoto}
            onCenterChange={setMapCenter}
            onZoomChange={setMapZoom}
          />
        )}
      </div>

      {/* ----------------- GOOGLE MAPS FLOATING BOTTOM-LEFT "CAPAS" BUTTON ----------------- */}
      <div className="absolute bottom-4 left-4 z-30 flex items-end gap-3 pointer-events-auto">
        {/* Layer switch thumbnail button */}
        <div
          onClick={() => setIsLayersModalOpen(!isLayersModalOpen)}
          className="w-16 h-16 rounded-xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] border-2 border-white overflow-hidden cursor-pointer hover:scale-105 transition-transform flex flex-col group relative"
          title="Cambiar capas y plano con transparencia"
        >
          {/* Thumbnail preview */}
          <div className="w-full h-11 relative overflow-hidden bg-slate-800">
            {mapLayerType === 'satellite' ? (
              <img
                src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/63914/40545"
                alt="Capas"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = 'https://tile.openstreetmap.org/17/40545/63914.png';
                }}
              />
            ) : (
              <div className="w-full h-full bg-[#e8eaed] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#5f6368] text-[20px]">map</span>
              </div>
            )}
            {blueprint.visible && (
              <div className="absolute inset-0 bg-[#00e5ff]/20 border border-[#00e5ff]" />
            )}
          </div>
          <div className="w-full h-5 bg-white flex items-center justify-center">
            <span className="text-[11px] font-['Google_Sans',Roboto,sans-serif] font-medium text-[#3c4043]">
              Capas
            </span>
          </div>
        </div>

        {/* Google Maps Weather & Status Pill (from user screenshot bottom card) */}
        <div className="hidden sm:flex items-center gap-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_2px_6px_rgba(0,0,0,0.25)] px-4 py-2.5 border border-[#dadce0] font-['Google_Sans',Roboto,sans-serif]">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[#202124]">Subestación</span>
            <span className="text-[13px] text-[#5f6368]">29°C</span>
            <span className="material-symbols-outlined text-amber-500 text-[18px]">wb_sunny</span>
          </div>
          <div className="w-[1px] h-4 bg-[#dadce0]" />
          <div className="flex items-center gap-1.5 text-[12px] text-[#5f6368]">
            <span className="w-2 h-2 rounded-full bg-[#34a853] animate-pulse"></span>
            <span>{filteredPhotos.length} Cajas Registradas</span>
            <span className="font-semibold text-[#1a73e8]">({totalMeters.toFixed(1)}m)</span>
          </div>
        </div>
      </div>

      {/* ----------------- GOOGLE MAPS FLOATING BOTTOM-RIGHT CONTROLS ----------------- */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2.5 pointer-events-auto">
        {/* Toggle Fullscreen Button */}
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="w-10 h-10 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:bg-[#f8f9fa] flex items-center justify-center text-[#5f6368] hover:text-[#1a73e8] transition-all"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Modo Pantalla Completa'}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
          </span>
        </button>

        {/* Center on Inspector GPS Button */}
        <button
          type="button"
          onClick={handleCenterOnInspector}
          className="w-10 h-10 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:bg-[#f8f9fa] flex items-center justify-center text-[#5f6368] hover:text-[#1a73e8] transition-all"
          title="Centrar en mi ubicación GPS"
        >
          <span className="material-symbols-outlined text-[20px] text-[#1a73e8]">
            my_location
          </span>
        </button>

        {/* Zoom In / Out Vertical Pill */}
        <div className="bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col border border-[#dadce0]">
          <button
            type="button"
            onClick={() => mapZoom < 20 && setMapZoom(mapZoom + 1)}
            className="w-10 h-10 flex items-center justify-center text-[#5f6368] hover:bg-[#f8f9fa] hover:text-[#202124] transition-colors"
            title="Acercar (+)"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
          <div className="w-full h-[1px] bg-[#dadce0]" />
          <button
            type="button"
            onClick={() => mapZoom > 14 && setMapZoom(mapZoom - 1)}
            className="w-10 h-10 flex items-center justify-center text-[#5f6368] hover:bg-[#f8f9fa] hover:text-[#202124] transition-colors"
            title="Alejar (-)"
          >
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
        </div>

        {/* Pegman / Inspector Street View Icon */}
        <div
          onClick={handleCenterOnBlueprint}
          className="w-10 h-10 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:bg-[#f8f9fa] flex items-center justify-center cursor-pointer group"
          title="Ir al centro del plano de obra"
        >
          <div className="w-6 h-6 rounded-full overflow-hidden border border-[#dadce0]">
            <img src={inspector.avatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* ----------------- GOOGLE MAPS STYLE LAYERS & BLUEPRINT POPOVER ----------------- */}
      {isLayersModalOpen && (
        <div className="absolute bottom-24 left-4 z-40 w-80 sm:w-96 max-h-[80vh] overflow-y-auto bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.25)] border border-[#dadce0] p-5 font-['Google_Sans',Roboto,sans-serif] animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#dadce0]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1a73e8] text-[22px]">
                layers
              </span>
              <h3 className="font-semibold text-[#202124] text-[16px]">
                Capas de Mapa y Plano
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsLayersModalOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="mt-4 space-y-5">
            {/* Map Style Selector (Satellite / Streets / Topo) */}
            <div>
              <label className="block text-[13px] font-semibold text-[#202124] mb-2">
                Tipo de Mapa
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Satellite Option */}
                <button
                  type="button"
                  onClick={() => setMapLayerType('satellite')}
                  className={`flex flex-col items-center p-2 rounded-2xl border transition-all ${
                    mapLayerType === 'satellite'
                      ? 'border-[#1a73e8] bg-[#e8f0fe] ring-2 ring-[#1a73e8]/20'
                      : 'border-[#dadce0] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <div className="w-12 h-10 rounded-xl overflow-hidden mb-1.5 bg-slate-800">
                    <img
                      src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/63914/40545"
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'https://tile.openstreetmap.org/17/40545/63914.png';
                      }}
                    />
                  </div>
                  <span className="text-[12px] font-medium text-[#202124]">Satélite</span>
                </button>

                {/* Streets Option */}
                <button
                  type="button"
                  onClick={() => setMapLayerType('streets')}
                  className={`flex flex-col items-center p-2 rounded-2xl border transition-all ${
                    mapLayerType === 'streets'
                      ? 'border-[#1a73e8] bg-[#e8f0fe] ring-2 ring-[#1a73e8]/20'
                      : 'border-[#dadce0] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <div className="w-12 h-10 rounded-xl overflow-hidden mb-1.5 bg-slate-100 flex items-center justify-center border border-[#dadce0]">
                    <span className="material-symbols-outlined text-[#5f6368] text-[22px]">map</span>
                  </div>
                  <span className="text-[12px] font-medium text-[#202124]">Calles</span>
                </button>

                {/* Topo Option */}
                <button
                  type="button"
                  onClick={() => setMapLayerType('topo')}
                  className={`flex flex-col items-center p-2 rounded-2xl border transition-all ${
                    mapLayerType === 'topo'
                      ? 'border-[#1a73e8] bg-[#e8f0fe] ring-2 ring-[#1a73e8]/20'
                      : 'border-[#dadce0] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <div className="w-12 h-10 rounded-xl overflow-hidden mb-1.5 bg-slate-100 flex items-center justify-center border border-[#dadce0]">
                    <span className="material-symbols-outlined text-[#5f6368] text-[22px]">terrain</span>
                  </div>
                  <span className="text-[12px] font-medium text-[#202124]">Relieve</span>
                </button>
              </div>
            </div>

            {/* Blueprint Toggle & Transparency */}
            <div className="p-3.5 bg-[#f8f9fa] rounded-2xl border border-[#dadce0] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-[#202124]">
                    Superponer Plano de Obra
                  </div>
                  <div className="text-[11px] text-[#5f6368]">
                    {blueprint.visible ? 'Plano visible sobre el satélite' : 'Plano desactivado'}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blueprint.visible}
                    onChange={(e) =>
                      setBlueprint((prev) => ({ ...prev, visible: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a73e8]"></div>
                </label>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1.5 pt-2 border-t border-[#dadce0]">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#202124] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#1a73e8]">
                      opacity
                    </span>
                    Transparencia
                  </span>
                  <span className="font-mono font-bold text-[#1a73e8] bg-[#e8f0fe] px-2 py-0.5 rounded-full text-[11px]">
                    {Math.round(blueprint.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={blueprint.opacity}
                  onChange={(e) =>
                    setBlueprint((prev) => ({ ...prev, opacity: parseFloat(e.target.value) }))
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                />
                <div className="flex justify-between text-[10px] text-[#70757a]">
                  <span>0% (Transparente)</span>
                  <span>50%</span>
                  <span>100% (Sólido)</span>
                </div>
              </div>
            </div>

            {/* Select Sample or Upload Custom Blueprint */}
            <div>
              <label className="block text-[13px] font-semibold text-[#202124] mb-2">
                Plantillas y Carga de Planos
              </label>
              <div className="space-y-1.5">
                {SAMPLE_BLUEPRINTS.map((bp) => (
                  <button
                    key={bp.id}
                    type="button"
                    onClick={() =>
                      setBlueprint((prev) => ({
                        ...prev,
                        name: bp.name,
                        imageUrl: bp.imageUrl,
                        opacity: bp.defaultOpacity,
                        visible: true,
                      }))
                    }
                    className={`w-full text-left px-3 py-2 rounded-xl text-[12px] flex items-center justify-between transition-all ${
                      blueprint.name === bp.name
                        ? 'bg-[#e8f0fe] text-[#1a73e8] font-bold border border-[#1a73e8]/30'
                        : 'bg-white hover:bg-[#f8f9fa] text-[#3c4043] border border-[#dadce0]'
                    }`}
                  >
                    <span className="truncate">{bp.name}</span>
                    {blueprint.name === bp.name && (
                      <span className="material-symbols-outlined text-[16px] text-[#1a73e8]">
                        check
                      </span>
                    )}
                  </button>
                ))}

                {/* Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.svg,.png,.jpg,.jpeg"
                  onChange={handleBlueprintUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full mt-2 py-2 px-3 rounded-xl border border-dashed border-[#1a73e8] bg-[#e8f0fe]/50 text-[#1a73e8] hover:bg-[#e8f0fe] text-[12px] font-medium flex items-center justify-center gap-1.5 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  <span>Cargar Mi Propio Plano (PNG/JPG/SVG)</span>
                </button>
              </div>
            </div>

            {/* Fine Alignment Controls */}
            <div className="pt-2 border-t border-[#dadce0]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-[#202124]">
                  Micro-Alineación del Plano
                </span>
                <button
                  type="button"
                  onClick={() => setIsBlueprintLocked(!isBlueprintLocked)}
                  className={`text-[11px] font-medium flex items-center gap-1 px-2 py-0.5 rounded-full ${
                    isBlueprintLocked ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-[#5f6368]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {isBlueprintLocked ? 'lock' : 'lock_open'}
                  </span>
                  <span>{isBlueprintLocked ? 'Bloqueado' : 'Ajustable'}</span>
                </button>
              </div>

              {!isBlueprintLocked && (
                <div className="flex items-center justify-center gap-2">
                  <div className="grid grid-cols-3 gap-1 w-28">
                    <div />
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(0.0001, 0)}
                      className="p-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[#202124] flex items-center justify-center"
                      title="Mover Norte"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                    </button>
                    <div />
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(0, -0.0001)}
                      className="p-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[#202124] flex items-center justify-center"
                      title="Mover Oeste"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCenterOnBlueprint}
                      className="p-1 rounded-lg bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center"
                      title="Centrar"
                    >
                      <span className="material-symbols-outlined text-[16px]">center_focus_strong</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(0, 0.0001)}
                      className="p-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[#202124] flex items-center justify-center"
                      title="Mover Este"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                    <div />
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(-0.0001, 0)}
                      className="p-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[#202124] flex items-center justify-center"
                      title="Mover Sur"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                    </button>
                    <div />
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(0, 0, 1.05)}
                      className="px-2.5 py-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[11px] font-medium text-[#202124]"
                    >
                      + Escalar
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustBlueprintBounds(0, 0, 0.95)}
                      className="px-2.5 py-1 rounded-lg bg-[#f1f3f4] hover:bg-[#e8f0fe] text-[11px] font-medium text-[#202124]"
                    >
                      - Escalar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- GOOGLE MAPS API KEY MODAL ----------------- */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-['Google_Sans',Roboto,sans-serif]">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#dadce0] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">key</span>
              </div>
              <div>
                <h3 className="font-bold text-[#202124] text-[17px]">
                  Configurar Google Maps API
                </h3>
                <p className="text-[12px] text-[#5f6368]">
                  Activa el motor oficial de Google Maps
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3c4043] mb-4 leading-relaxed">
              El motor integrado de <strong>Satélite HD</strong> funciona de forma continua sin costo ni configuración. Si deseas utilizar las capas oficiales de Google Maps, ingresa tu API Key a continuación:
            </p>

            <div className="space-y-2 mb-6">
              <label className="block text-[12px] font-semibold text-[#202124]">
                Google Maps API Key
              </label>
              <input
                type="text"
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-2.5 rounded-xl border border-[#dadce0] focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 outline-none text-[13px] font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="px-4 py-2 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-5 py-2 rounded-full text-[13px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] text-white shadow-sm"
              >
                Guardar y Usar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
