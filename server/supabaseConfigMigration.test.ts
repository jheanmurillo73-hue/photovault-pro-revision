import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Migración de configuración de Supabase', () => {
  it('ignora las credenciales locales creadas antes de la versión vigente', async () => {
    store.set('photovault_supabase_url', 'https://legacy-project.supabase.co/rest/v1');
    store.set('photovault_supabase_anon_key', 'legacy-public-key');
    const { getActiveSupabaseConfig } = await import('../client/src/lib/supabase');

    const config = getActiveSupabaseConfig();

    expect(config.isCustom).toBe(false);
    expect(config.url).not.toBe('https://legacy-project.supabase.co');
  });

  it('mantiene una conexión personalizada guardada nuevamente en la versión vigente', async () => {
    const { getActiveSupabaseConfig, saveCustomSupabaseConfig, SUPABASE_CONFIG_VERSION } = await import('../client/src/lib/supabase');

    saveCustomSupabaseConfig('https://custom-project.supabase.co/rest/v1', 'custom-public-key');

    expect(store.get('photovault_supabase_config_version')).toBe(SUPABASE_CONFIG_VERSION);
    expect(getActiveSupabaseConfig()).toEqual({
      url: 'https://custom-project.supabase.co',
      anonKey: 'custom-public-key',
      isCustom: true,
    });
  });
});
