// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopNavBar } from '../client/src/components/TopNavBar';

afterEach(cleanup);

const baseProps = {
  currentTab: 'dashboard',
  onTabChange: vi.fn(),
  inspector: {
    id: 'admin-1',
    name: 'Administrador',
    email: 'admin@example.com',
    role: 'Administrador',
    terminal: 'Central',
    avatarUrl: 'https://example.com/avatar.jpg',
    phone: '',
    department: 'Obra',
  },
  allowedModules: [],
  isAdmin: true,
  onOpenProfile: vi.fn(),
  activities: [],
  onOpenPhoto: vi.fn(),
  onToggleMobileMenu: vi.fn(),
  onRefreshConnection: vi.fn(),
};

describe('Indicador de conexión con Supabase', () => {
  it('comunica que la aplicación está conectada', () => {
    render(<TopNavBar {...baseProps} connectionState="connected" />);

    const indicator = screen.getByRole('button', { name: /estado de conexión: conectado a supabase/i });
    expect(indicator.textContent).toContain('Conectado a Supabase');
    expect(indicator.className).toContain('emerald');
  });

  it('comunica que no hay conexión y permite comprobar de nuevo', () => {
    const onRefreshConnection = vi.fn();
    render(<TopNavBar {...baseProps} connectionState="disconnected" onRefreshConnection={onRefreshConnection} />);

    const indicator = screen.getByRole('button', { name: /estado de conexión: sin conexión a supabase/i });
    expect(indicator.textContent).toContain('Sin conexión a Supabase');
    indicator.click();
    expect(onRefreshConnection).toHaveBeenCalledOnce();
  });
});
