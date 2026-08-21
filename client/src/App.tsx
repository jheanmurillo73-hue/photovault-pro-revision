/**
 * Diseño: cartografía técnica sobria. El detalle de cualquier elemento mantiene
 * una salida directa hacia el plano para conservar el flujo espacial de trabajo.
 */
import React, { useState, useEffect } from 'react';
import {
  InspectionPhoto,
  InspectorProfile,
  AppSettings,
  ActivityItem,
  InspectionCollection,
  AppModule,
  UserAccess,
} from './types';
import {
  INITIAL_PHOTOS,
  DEFAULT_INSPECTOR,
  INITIAL_SETTINGS,
  INITIAL_COLLECTIONS,
  INITIAL_ACTIVITIES,
} from './data/mockData';
import { TopNavBar } from './components/TopNavBar';
import { SideNavBar } from './components/SideNavBar';
import { DashboardView } from './components/DashboardView';
import { PhotoDetailView } from './components/PhotoDetailView';
import { UploadPhotoView } from './components/UploadPhotoView';
import { SettingsView } from './components/SettingsView';
import { HistoryView } from './components/HistoryView';
import { ActivityView } from './components/ActivityView';
import { MapView } from './components/MapView';
import { DatabaseTableView } from './components/DatabaseTableView';
import { EditPhotoModal } from './components/EditPhotoModal';
import { ProfileModal } from './components/ProfileModal';
import { SignOutModal } from './components/SignOutModal';
import { AuthModal } from './components/AuthModal';
import { AuthScreen } from './components/AuthScreen';
import { SupabaseTablesModal } from './components/SupabaseTablesModal';
import { UserManagementView } from './components/UserManagementView';
import { supabaseService } from './services/supabaseService';
import { canAccessModule, createFallbackAccess, MODULE_DEFINITIONS } from './lib/accessControl';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';

const normalizeSettings = (candidate?: Partial<AppSettings> | null): AppSettings => ({
  emailNotifications: candidate?.emailNotifications ?? INITIAL_SETTINGS.emailNotifications,
  pushNotifications: candidate?.pushNotifications ?? INITIAL_SETTINGS.pushNotifications,
  syncWifiOnly: candidate?.syncWifiOnly ?? INITIAL_SETTINGS.syncWifiOnly,
  highQualityUploads: candidate?.highQualityUploads ?? INITIAL_SETTINGS.highQualityUploads,
  autoVerifyPassed: candidate?.autoVerifyPassed ?? INITIAL_SETTINGS.autoVerifyPassed,
  offlineStorageLimitMb: typeof candidate?.offlineStorageLimitMb === 'number'
    ? candidate.offlineStorageLimitMb
    : INITIAL_SETTINGS.offlineStorageLimitMb,
});

const normalizePlanCoordinate = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value >= 0 && value <= 100 ? value : undefined;
};

const normalizeInspectionPhoto = (photo: InspectionPhoto): InspectionPhoto => ({
  ...photo,
  name: photo.name ?? 'Inspección sin nombre',
  type: photo.type ?? '',
  location: photo.location ?? '',
  fieldNotes: photo.fieldNotes ?? '',
  executionStatus: photo.executionStatus ?? 'En proceso',
  status: photo.status ?? 'Synced',
  requiresImmediateAction: Boolean(photo.requiresImmediateAction),
  verified: Boolean(photo.verified),
  planX: normalizePlanCoordinate(photo.planX),
  planY: normalizePlanCoordinate(photo.planY),
  planEndX: normalizePlanCoordinate(photo.planEndX),
  planEndY: normalizePlanCoordinate(photo.planEndY),
});

export default function App() {
  // Session Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('photovault_authenticated') === 'true';
  });

  // Local storage persisted state
  const [photos, setPhotos] = useState<InspectionPhoto[]>(() => {
    const saved = localStorage.getItem('photovault_photos');
    if (!saved) return INITIAL_PHOTOS;
    try {
      const parsed: InspectionPhoto[] = JSON.parse(saved);
      return parsed
        .filter((p) => !['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5'].includes(p.id))
        .map(normalizeInspectionPhoto);
    } catch {
      return INITIAL_PHOTOS;
    }
  });

  const [inspector, setInspector] = useState<InspectorProfile>(() => {
    const saved = localStorage.getItem('photovault_inspector');
    return saved ? JSON.parse(saved) : DEFAULT_INSPECTOR;
  });

  const [userAccess, setUserAccess] = useState<UserAccess>(() =>
    createFallbackAccess({ id: inspector.id, email: inspector.email, name: inspector.name }),
  );

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('photovault_settings');
    try {
      return normalizeSettings(saved ? JSON.parse(saved) : INITIAL_SETTINGS);
    } catch {
      return normalizeSettings(INITIAL_SETTINGS);
    }
  });

  const [collections] = useState<InspectionCollection[]>(INITIAL_COLLECTIONS);

  const [activities, setActivities] = useState<ActivityItem[]>(() => {
    const saved = localStorage.getItem('photovault_activities');
    if (!saved) return INITIAL_ACTIVITIES;
    try {
      const parsed: ActivityItem[] = JSON.parse(saved);
      return parsed.filter(
        (a) => !['act-1', 'act-2', 'act-3', 'act-4'].includes(a.id)
      );
    } catch {
      return INITIAL_ACTIVITIES;
    }
  });

  // Navigation & UI State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [editingPhoto, setEditingPhoto] = useState<InspectionPhoto | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' | 'error' } | null>(null);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('photovault_photos', JSON.stringify(photos));
  }, [photos]);

  useEffect(() => {
    localStorage.setItem('photovault_inspector', JSON.stringify(inspector));
  }, [inspector]);

  useEffect(() => {
    localStorage.setItem('photovault_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('photovault_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    const resolveUserAccess = async () => {
      await supabaseService.syncProfile(inspector, inspector.id);
      const access = await supabaseService.getUserAccess(inspector);
      if (active) setUserAccess(access);
    };

    resolveUserAccess();
    return () => {
      active = false;
    };
  }, [isAuthenticated, inspector.id, inspector.email, inspector.name]);

  // Initial optional load from Supabase if configured and photos array is empty
  useEffect(() => {
    const checkAndLoadSupabase = async () => {
      if (supabaseService.isConfigured() && photos.length === 0) {
        try {
          const remotePhotos = await supabaseService.fetchPhotos();
          if (remotePhotos && remotePhotos.length > 0) {
            setPhotos(remotePhotos);
            showToast(`Se cargaron ${remotePhotos.length} inspecciones desde Supabase`, 'info');
          }
        } catch (err) {
          console.warn('Initial Supabase fetch skipped:', err);
        }
      }
    };
    checkAndLoadSupabase();
  }, []);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const addActivity = (action: string, photoName: string, photoId: string, type: ActivityItem['type']) => {
    const newAct: ActivityItem = {
      id: `act-${Date.now()}`,
      timestamp: 'Justo ahora',
      action,
      photoName,
      photoId,
      user: inspector.name,
      type,
    };
    setActivities((prev) => [newAct, ...prev]);

    // Sync activity to Supabase in background
    supabaseService.logActivity(newAct, inspector.id);
  };

  // Photo handlers
  const handleSelectPhoto = (photo: InspectionPhoto) => {
    setSelectedPhotoId(photo.id);
    setCurrentTab('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToGallery = () => {
    setSelectedPhotoId(null);
    setCurrentTab('dashboard');
  };

  const handleUpdatePhotoTitle = (id: string, newTitle: string) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, name: newTitle };
          supabaseService.savePhoto(updated, inspector.id);
          return updated;
        }
        return p;
      })
    );
  };

  const handleUpdatePhoto = (updated: InspectionPhoto) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    addActivity('Detalles actualizados', updated.name, updated.id, 'edit');
    showToast(`Actualizado "${updated.name}"`);

    // Sync to Supabase
    supabaseService.savePhoto(updated, inspector.id);
  };

  const handleUpdatePhotoPosition = (
    photoId: string,
    position: Pick<InspectionPhoto, 'planX' | 'planY' | 'planEndX' | 'planEndY'>,
  ) => {
    const currentPhoto = photos.find((photo) => photo.id === photoId);
    if (!currentPhoto) return;

    const updated = normalizeInspectionPhoto({ ...currentPhoto, ...position });
    setPhotos((previous) => previous.map((photo) => (photo.id === photoId ? updated : photo)));
    supabaseService.savePhoto(updated, inspector.id);
    addActivity('Ubicación actualizada en el plano', updated.name, updated.id, 'edit');
    showToast(`Ubicación guardada para "${updated.name}"`);
  };

  const handleDeletePhoto = (id: string) => {
    const photo = photos.find((p) => p.id === id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (selectedPhotoId === id) {
      setSelectedPhotoId(null);
      setCurrentTab('dashboard');
    }
    if (photo) {
      addActivity('Inspección eliminada', photo.name, photo.id, 'flag');
      showToast(`"${photo.name}" ha sido eliminada`, 'info');
      // Delete in Supabase
      supabaseService.deletePhoto(id);
    }
  };

  const handleUploadSuccess = (newPhoto: InspectionPhoto) => {
    setPhotos((prev) => [newPhoto, ...prev]);
    addActivity('Foto de inspección subida', newPhoto.name, newPhoto.id, 'upload');
    showToast(`"${newPhoto.name}" subida exitosamente`);
    
    // Sync to Supabase in background
    supabaseService.savePhoto(newPhoto, inspector.id);

    setSelectedPhotoId(newPhoto.id);
    setCurrentTab('detail');
  };

  const handleOpenPhotoFromActivity = (photoId: string) => {
    const found = photos.find((p) => p.id === photoId);
    if (found) {
      setSelectedPhotoId(photoId);
      setCurrentTab('detail');
    } else {
      showToast('La foto de inspección ya no está disponible en la caché.', 'error');
    }
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(normalizeSettings(newSettings));
    showToast('Preferencias actualizadas');
  };

  const handleSaveProfile = (updatedProfile: InspectorProfile) => {
    const oldInspector = inspector;
    setInspector(updatedProfile);
    // Also propagate new avatar and name to photos belonging to this inspector
    setPhotos((prev) =>
      prev.map((p) =>
        p.inspectorId === updatedProfile.id || p.inspectorName === oldInspector.name || p.inspectorId === oldInspector.id
          ? {
              ...p,
              inspectorName: updatedProfile.name,
              inspectorAvatar: updatedProfile.avatarUrl,
              inspectorId: updatedProfile.id,
            }
          : p
      )
    );
    supabaseService.syncProfile(updatedProfile, updatedProfile.id);
    showToast('Credenciales y foto del inspector actualizadas');
  };

  const handleAuthSuccess = (newProfile: InspectorProfile, userEmail: string) => {
    setInspector(newProfile);
    setUserAccess(createFallbackAccess({ id: newProfile.id, email: newProfile.email, name: newProfile.name }));
    setIsAuthenticated(true);
    sessionStorage.setItem('photovault_authenticated', 'true');
    showToast(`Sesión iniciada como ${newProfile.name} (${userEmail})`, 'success');
  };

  const handleRestoreBackup = (backupData: {
    photos?: InspectionPhoto[];
    inspector?: InspectorProfile;
    settings?: AppSettings;
    activities?: ActivityItem[];
  }) => {
    if (backupData.photos && Array.isArray(backupData.photos)) {
      setPhotos(backupData.photos.map(normalizeInspectionPhoto));
    }
    if (backupData.inspector) {
      setInspector(backupData.inspector);
    }
    if (backupData.settings) {
      setSettings(normalizeSettings(backupData.settings));
    }
    if (backupData.activities && Array.isArray(backupData.activities)) {
      setActivities(backupData.activities);
    }
    showToast('Respaldo cargado exitosamente en la memoria del dispositivo.', 'success');
  };

  const handlePhotosImported = (importedPhotos: InspectionPhoto[]) => {
    setPhotos(importedPhotos);
    showToast(`Se cargaron ${importedPhotos.length} fotos desde Supabase`, 'success');
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'admin' && userAccess.role !== 'admin') {
      showToast('Solo los administradores pueden gestionar usuarios y permisos.', 'error');
      return;
    }

    const isOperationalModule = MODULE_DEFINITIONS.some((module) => module.id === tab);
    if (isOperationalModule && !canAccessModule(userAccess, tab as AppModule)) {
      showToast('Tu usuario no tiene permiso para acceder a este módulo.', 'error');
      return;
    }

    if (tab !== 'detail') {
      setSelectedPhotoId(null);
    }
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const activeModule = MODULE_DEFINITIONS.find((module) => module.id === currentTab);
    if (currentTab === 'admin' && userAccess.role !== 'admin') {
      setCurrentTab('dashboard');
    } else if (activeModule && !canAccessModule(userAccess, activeModule.id)) {
      const fallbackModule = MODULE_DEFINITIONS.find((module) => canAccessModule(userAccess, module.id));
      setCurrentTab(fallbackModule?.id || 'dashboard');
    }
  }, [currentTab, userAccess]);

  // If not authenticated, display full Authentication Gate directly
  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        defaultInspector={inspector}
      />
    );
  }

  const selectedPhoto = photos.find((p) => p.id === selectedPhotoId);

  return (
    <div className="min-h-screen flex flex-col bg-[#f3faff] text-[#071e27] font-['Inter']">
      {/* Fixed Top Nav Bar */}
      <TopNavBar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        inspector={inspector}
        allowedModules={userAccess.allowedModules}
        isAdmin={userAccess.role === 'admin'}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        activities={activities}
        onOpenPhoto={handleOpenPhotoFromActivity}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
      />

      <div className="flex flex-1 pt-16">
        {/* Fixed Side Nav Bar (Desktop & Mobile Drawer) */}
        <SideNavBar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          inspector={inspector}
          allowedModules={userAccess.allowedModules}
          isAdmin={userAccess.role === 'admin'}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onSignOut={() => setIsSignOutModalOpen(true)}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
        />

        {/* Main Content Area */}
        <div className={`flex-1 md:ml-64 flex flex-col ${currentTab === 'map' ? 'h-[calc(100vh-64px)] overflow-hidden' : 'min-h-[calc(100vh-64px)] justify-between'}`}>
          <main className={`${currentTab === 'map' ? 'p-0 h-full w-full relative overflow-hidden' : 'p-4 sm:p-6 lg:p-8 flex-1'}`}>
            {currentTab === 'admin' && userAccess.role === 'admin' ? (
              <UserManagementView currentUser={userAccess} onShowToast={showToast} />
            ) : currentTab === 'detail' && selectedPhoto ? (
              <PhotoDetailView
                photo={selectedPhoto}
                onBack={handleBackToGallery}
                onBackToMap={() => {
                  handleTabChange('map');
                  if (canAccessModule(userAccess, 'map')) {
                    showToast('Regresaste al mapa del elemento seleccionado', 'info');
                  }
                }}
                onEdit={(photo) => setEditingPhoto(photo)}
                onDelete={handleDeletePhoto}
                onUpdatePhoto={handleUpdatePhoto}
              />
            ) : currentTab === 'map' ? (
              <MapView
                photos={photos}
                inspector={inspector}
                onSelectPhoto={handleSelectPhoto}
                onNavigateToUpload={() => handleTabChange('upload')}
                onUpdatePhotoPosition={handleUpdatePhotoPosition}
              />
            ) : currentTab === 'database' ? (
              <DatabaseTableView
                photos={photos}
                inspector={inspector}
                onSelectPhoto={handleSelectPhoto}
                onNavigateToMap={(targetPhoto) => {
                  if (targetPhoto) {
                    setSelectedPhotoId(targetPhoto.id);
                  }
                  handleTabChange('map');
                }}
                onNavigateToUpload={() => handleTabChange('upload')}
                onEditPhoto={(photo) => setEditingPhoto(photo)}
                onDeletePhoto={handleDeletePhoto}
                onUpdatePhoto={handleUpdatePhoto}
              />
            ) : currentTab === 'upload' ? (
              <UploadPhotoView
                onUploadSuccess={handleUploadSuccess}
                onCancel={handleBackToGallery}
                inspector={inspector}
                onOpenAuth={() => setIsAuthModalOpen(true)}
              />
            ) : currentTab === 'settings' ? (
              <SettingsView
                settings={settings}
                onSaveSettings={handleSaveSettings}
                inspector={inspector}
                onOpenProfile={() => setIsProfileModalOpen(true)}
                onShowToast={showToast}
                onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
                photos={photos}
                activities={activities}
                onRestoreBackup={handleRestoreBackup}
              />
            ) : currentTab === 'history' || currentTab === 'collections' ? (
              <HistoryView
                photos={photos}
                onSelectPhoto={handleSelectPhoto}
                onUpdatePhoto={handleUpdatePhoto}
                onDeletePhoto={handleDeletePhoto}
                onNavigateToUpload={() => handleTabChange('upload')}
              />
            ) : currentTab === 'activity' ? (
              <ActivityView
                activities={activities}
                photos={photos}
                onOpenPhoto={handleOpenPhotoFromActivity}
              />
            ) : (
              <DashboardView
                photos={photos}
                onSelectPhoto={handleSelectPhoto}
                onUpdatePhotoTitle={handleUpdatePhotoTitle}
                onDeletePhoto={handleDeletePhoto}
                onNavigateToUpload={() => handleTabChange('upload')}
              />
            )}
          </main>

          {/* Footer - only for non-map views */}
          {currentTab !== 'map' && <Footer />}
        </div>
      </div>

      {/* Supabase Tables & Schema Modal */}
      <SupabaseTablesModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        photos={photos}
        inspector={inspector}
        onPhotosImported={handlePhotosImported}
        onShowToast={showToast}
      />

      {/* Supabase Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        currentInspector={inspector}
      />

      {/* Edit Photo Details Modal */}
      {editingPhoto && (
        <EditPhotoModal
          photo={editingPhoto}
          isOpen={!!editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onSave={handleUpdatePhoto}
        />
      )}

      {/* Inspector Profile Modal */}
      <ProfileModal
        inspector={inspector}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {/* Sign Out Confirmation Modal */}
      <SignOutModal
        isOpen={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        onConfirm={() => {
          setIsSignOutModalOpen(false);
          setIsAuthenticated(false);
          sessionStorage.removeItem('photovault_authenticated');
          showToast('Has cerrado sesión correctamente', 'info');
        }}
        inspector={inspector}
      />

      {/* Floating Action Toast Notification */}
      <Toast
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
