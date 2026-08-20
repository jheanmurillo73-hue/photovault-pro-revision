import { getSupabaseClient, isSupabaseConfigured, getActiveSupabaseConfig } from '../lib/supabase';
import { InspectionPhoto, InspectorProfile, ActivityItem, InspectionCollection, AppSettings } from '../types';

export interface SupabaseConnectionStatus {
  connected: boolean;
  configured: boolean;
  message: string;
  missingTables?: string[];
  existingTables?: string[];
}

export const supabaseService = {
  isConfigured: () => isSupabaseConfigured(),
  getConfig: () => getActiveSupabaseConfig(),

  // Test connection to Supabase and check if tables exist
  testConnection: async (): Promise<SupabaseConnectionStatus> => {
    if (!isSupabaseConfigured()) {
      return {
        connected: false,
        configured: false,
        message: 'Falta configurar la URL y la Anon Key de Supabase.',
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return {
        connected: false,
        configured: true,
        message: 'No se pudo inicializar el cliente de Supabase.',
      };
    }

    const tablesToCheck = [
      'inspection_photos',
      'profiles',
      'inspection_activities',
      'inspection_collections',
      'app_settings',
    ];

    const missingTables: string[] = [];
    const existingTables: string[] = [];

    for (const table of tablesToCheck) {
      try {
        const { error } = await client.from(table).select('id').limit(1);
        if (error) {
          // If error code is 42P01 (relation does not exist) or similar table missing error
          if (
            error.code === '42P01' ||
            error.code === 'PGRST205' ||
            /does not exist|relation|could not find the table|schema cache/i.test(error.message || '')
          ) {
            missingTables.push(table);
          } else if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
            return {
              connected: false,
              configured: true,
              message: 'Error de autenticación: Anon Key inválida o expirada.',
            };
          } else {
            // Table exists but maybe empty or RLS prevented rows, treat as existing
            existingTables.push(table);
          }
        } else {
          existingTables.push(table);
        }
      } catch (err: any) {
        missingTables.push(table);
      }
    }

    if (missingTables.length === 0) {
      return {
        connected: true,
        configured: true,
        message: '¡Conexión exitosa! Todas las tablas de inspección existen en Supabase.',
        existingTables,
        missingTables: [],
      };
    } else if (existingTables.length > 0) {
      return {
        connected: true,
        configured: true,
        message: `Conexión establecida. Faltan ${missingTables.length} tablas por crear: ${missingTables.join(', ')}.`,
        existingTables,
        missingTables,
      };
    } else {
      return {
        connected: true,
        configured: true,
        message: 'Conexión a Supabase establecida, pero las tablas aún no han sido creadas. Ejecuta el script SQL en el editor de Supabase.',
        existingTables: [],
        missingTables,
      };
    }
  },

  // Auth: Get current session/user
  getCurrentUser: async () => {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data } = await client.auth.getUser();
      return data.user || null;
    } catch (err) {
      console.warn('Error fetching Supabase user:', err);
      return null;
    }
  },

  // Auth: Sign Out
  signOut: async () => {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn('Error signing out from Supabase:', err);
      }
    }
  },

  // Photos: Save or sync photo to Supabase
  savePhoto: async (photo: InspectionPhoto, userId?: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await client.from('inspection_photos').upsert({
        id: photo.id,
        display_id: photo.displayId,
        name: photo.name,
        image_url: photo.imageUrl,
        date: photo.date,
        date_raw: photo.dateRaw,
        status: photo.status,
        execution_status: photo.executionStatus,
        category: photo.category,
        category_label: photo.categoryLabel,
        location: photo.location,
        camera_code: photo.cameraCode || 'SB850',
        camera_type: photo.cameraType || 'MT',
        tramo: photo.tramo || null,
        metraje: photo.metraje ? String(photo.metraje) : null,
        inspector_name: photo.inspectorName,
        inspector_id: photo.inspectorId,
        inspector_avatar: photo.inspectorAvatar,
        type: photo.type,
        verified: photo.verified,
        field_notes: photo.fieldNotes || '',
        requires_immediate_action: photo.requiresImmediateAction || false,
        file_size: photo.fileSize || '1.4 MB',
        resolution: photo.resolution || '1920x1080',
        user_id: userId || photo.inspectorId,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Supabase upsert note:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error saving to Supabase:', err);
      return false;
    }
  },

  // Photos: Bulk sync multiple photos to Supabase
  bulkSyncPhotos: async (photos: InspectionPhoto[], userId?: string): Promise<{ success: number; failed: number }> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured() || photos.length === 0) {
      return { success: 0, failed: photos.length };
    }

    const records = photos.map((photo) => ({
      id: photo.id,
      display_id: photo.displayId,
      name: photo.name,
      image_url: photo.imageUrl,
      date: photo.date,
      date_raw: photo.dateRaw,
      status: photo.status,
      execution_status: photo.executionStatus,
      category: photo.category,
      category_label: photo.categoryLabel,
      location: photo.location,
      camera_code: photo.cameraCode || 'SB850',
      camera_type: photo.cameraType || 'MT',
      tramo: photo.tramo || null,
      metraje: photo.metraje ? String(photo.metraje) : null,
      inspector_name: photo.inspectorName,
      inspector_id: photo.inspectorId,
      inspector_avatar: photo.inspectorAvatar,
      type: photo.type,
      verified: photo.verified,
      field_notes: photo.fieldNotes || '',
      requires_immediate_action: photo.requiresImmediateAction || false,
      file_size: photo.fileSize || '1.4 MB',
      resolution: photo.resolution || '1920x1080',
      user_id: userId || photo.inspectorId,
      updated_at: new Date().toISOString(),
    }));

    try {
      const { error } = await client.from('inspection_photos').upsert(records);
      if (error) {
        console.warn('Error in bulkSyncPhotos:', error.message);
        return { success: 0, failed: photos.length };
      }
      return { success: photos.length, failed: 0 };
    } catch (err) {
      console.warn('Bulk sync error:', err);
      return { success: 0, failed: photos.length };
    }
  },

  // Photos: Fetch all inspection photos from Supabase
  fetchPhotos: async (): Promise<InspectionPhoto[] | null> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return null;
    }

    try {
      const { data, error } = await client
        .from('inspection_photos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching photos from Supabase:', error.message);
        return null;
      }

      if (!data) return [];

      return data.map((item: any) => ({
        id: item.id,
        displayId: item.display_id || item.id,
        name: item.name || 'Sin título',
        imageUrl: item.image_url,
        date: item.date,
        dateRaw: item.date_raw || item.created_at || new Date().toISOString(),
        status: item.status || 'Synced',
        executionStatus: item.execution_status || 'En proceso',
        category: item.category || 'inspection',
        categoryLabel: item.category_label || 'Inspección',
        location: item.location || 'Bodega 1',
        cameraCode: item.camera_code || 'SB850',
        cameraType: item.camera_type || 'MT',
        tramo: item.tramo || undefined,
        metraje: item.metraje || undefined,
        inspectorName: item.inspector_name || 'Inspector',
        inspectorId: item.inspector_id || '8842',
        inspectorAvatar: item.inspector_avatar || '',
        type: item.type || 'Fotografía',
        verified: Boolean(item.verified),
        fieldNotes: item.field_notes || '',
        requiresImmediateAction: Boolean(item.requires_immediate_action),
        fileSize: item.file_size || '1.4 MB',
        resolution: item.resolution || '1920x1080',
      }));
    } catch (err) {
      console.warn('Error in fetchPhotos:', err);
      return null;
    }
  },

  // Photos: Delete photo from Supabase
  deletePhoto: async (photoId: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await client.from('inspection_photos').delete().eq('id', photoId);
      if (error) {
        console.warn('Error deleting photo from Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error in deletePhoto:', err);
      return false;
    }
  },

  // Profile: Sync Inspector Profile
  syncProfile: async (profile: InspectorProfile, userId?: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await client.from('profiles').upsert({
        id: userId || profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        terminal: profile.terminal,
        department: profile.department,
        avatar_url: profile.avatarUrl,
        phone: profile.phone,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Supabase profile sync note:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error syncing profile to Supabase:', err);
      return false;
    }
  },

  // Activity: Log activity
  logActivity: async (activity: ActivityItem, userId?: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await client.from('inspection_activities').upsert({
        id: activity.id,
        timestamp: activity.timestamp,
        action: activity.action,
        photo_name: activity.photoName,
        photo_id: activity.photoId,
        user_name: activity.user,
        type: activity.type,
        user_id: userId,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Error logging activity to Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error in logActivity:', err);
      return false;
    }
  },

  // Activity: Fetch activities
  fetchActivities: async (): Promise<ActivityItem[] | null> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return null;
    }

    try {
      const { data, error } = await client
        .from('inspection_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) return null;

      return data.map((item: any) => ({
        id: item.id,
        timestamp: item.timestamp,
        action: item.action,
        photoName: item.photo_name,
        photoId: item.photo_id,
        user: item.user_name,
        type: item.type,
      }));
    } catch (err) {
      console.warn('Error fetching activities:', err);
      return null;
    }
  },

  // Collections: Save collection
  saveCollection: async (collection: InspectionCollection, userId?: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await client.from('inspection_collections').upsert({
        id: collection.id,
        title: collection.title,
        description: collection.description,
        item_count: collection.itemCount,
        cover_image: collection.coverImage,
        category: collection.category,
        last_updated: collection.lastUpdated,
        photo_ids: collection.photoIds,
        user_id: userId,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Error saving collection:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error in saveCollection:', err);
      return false;
    }
  },

  // Returns the complete SQL creation script for Supabase SQL Editor
  getSupabaseSchemaSql: (): string => {
    return `-- ============================================================
-- SCHEMA DE BASE DE DATOS EN SUPABASE (POSTGRESQL) PARA PHOTOVAULT PRO
-- Contiene las tablas con la información de los registros agregados por el inspector
-- ============================================================

-- 1. TABLA DE PERFILES DE INSPECTORES (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Inspector de Campo',
  terminal TEXT DEFAULT 'Terminal A-12',
  department TEXT DEFAULT 'Garantía Estructural y Calidad',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. TABLA PRINCIPAL DE FOTOS Y REGISTROS DE INSPECCIÓN (inspection_photos)
CREATE TABLE IF NOT EXISTS public.inspection_photos (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  date TEXT NOT NULL,
  date_raw TEXT,
  status TEXT NOT NULL DEFAULT 'Synced' CHECK (status IN ('Synced', 'In Progress', 'Flagged')),
  execution_status TEXT NOT NULL DEFAULT 'En proceso' CHECK (execution_status IN ('En proceso', 'Terminado')),
  category TEXT NOT NULL DEFAULT 'inspection',
  category_label TEXT NOT NULL DEFAULT 'Inspección General',
  location TEXT NOT NULL DEFAULT 'Bodega 1',
  camera_code TEXT DEFAULT 'SB850',
  camera_type TEXT DEFAULT 'MT',
  tramo TEXT,
  metraje TEXT,
  inspector_name TEXT NOT NULL,
  inspector_id TEXT NOT NULL,
  inspector_avatar TEXT DEFAULT '',
  type TEXT DEFAULT 'Fotografía de Campo',
  verified BOOLEAN NOT NULL DEFAULT false,
  field_notes TEXT DEFAULT '',
  requires_immediate_action BOOLEAN NOT NULL DEFAULT false,
  file_size TEXT DEFAULT '1.4 MB',
  resolution TEXT DEFAULT '1920x1080',
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABLA DE REGISTRO DE ACTIVIDADES Y AUDITORÍA (inspection_activities)
CREATE TABLE IF NOT EXISTS public.inspection_activities (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  photo_name TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'upload' CHECK (type IN ('upload', 'sync', 'edit', 'flag', 'verified')),
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABLA DE COLECCIONES Y CARPETAS DE INSPECCIÓN (inspection_collections)
CREATE TABLE IF NOT EXISTS public.inspection_collections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  cover_image TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  last_updated TEXT NOT NULL,
  photo_ids JSONB DEFAULT '[]'::jsonb,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. TABLA DE PREFERENCIAS DE LA APLICACIÓN (app_settings)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default_settings',
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  push_notifications BOOLEAN NOT NULL DEFAULT false,
  sync_wifi_only BOOLEAN NOT NULL DEFAULT true,
  high_quality_uploads BOOLEAN NOT NULL DEFAULT false,
  auto_verify_passed BOOLEAN NOT NULL DEFAULT true,
  offline_storage_limit_mb INTEGER NOT NULL DEFAULT 500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- ÍNDICES DE RENDIMIENTO (Búsquedas rápidas por fecha, estado y código)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inspection_photos_date ON public.inspection_photos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_execution_status ON public.inspection_photos (execution_status);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_status ON public.inspection_photos (status);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_location ON public.inspection_photos (location);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_camera_code ON public.inspection_photos (camera_code);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspector_id ON public.inspection_photos (inspector_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.inspection_activities (created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Acceso a datos
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura y escritura para permitir sincronización sin fricción
DROP POLICY IF EXISTS "Acceso total a perfiles" ON public.profiles;
CREATE POLICY "Acceso total a perfiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a fotos de inspeccion" ON public.inspection_photos;
CREATE POLICY "Acceso total a fotos de inspeccion" ON public.inspection_photos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a actividades" ON public.inspection_activities;
CREATE POLICY "Acceso total a actividades" ON public.inspection_activities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a colecciones" ON public.inspection_collections;
CREATE POLICY "Acceso total a colecciones" ON public.inspection_collections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a configuracion" ON public.app_settings;
CREATE POLICY "Acceso total a configuracion" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Notificar recarga de caché
NOTIFY pgrst, 'reload schema';
`;
  },
};
