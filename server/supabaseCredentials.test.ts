import { describe, expect, it } from 'vitest';

const configuredUrl = (process.env.VITE_SUPABASE_URL || '').trim();
const publicKey = process.env.VITE_SUPABASE_ANON_KEY || '';

describe('Credenciales públicas de Supabase', () => {
  it.skipIf(!configuredUrl || !publicKey)('autentican una consulta ligera contra el endpoint público de Auth del proyecto', async () => {
    expect(configuredUrl).toBeTruthy();
    expect(publicKey).toMatch(/^sb_publishable_/);

    const response = await fetch(`${new URL(configuredUrl).origin}/auth/v1/settings`, {
      headers: { apikey: publicKey },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});
