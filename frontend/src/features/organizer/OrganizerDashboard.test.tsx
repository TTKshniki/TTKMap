import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthView, AdminView } from './OrganizerDashboard';
import { apiClient } from '../../shared/api';

vi.mock('../../shared/api');
vi.mock('../../shared/Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock('../capture', () => ({ CaptureGuide: () => <div>Capture Guide Mock</div> }));
vi.mock('../plan', () => ({ PlanEditor: () => <div>Plan Editor Mock</div> }));

describe('AuthView', () => {
  const mockOnLoginSuccess = vi.fn();
  const mockOnNotify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form with demo credentials hint', () => {
    render(<AuthView lang="ru" onLoginSuccess={mockOnLoginSuccess} onNotify={mockOnNotify} />);

    expect(screen.getByText(/Вход/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('alexey@ttk.ru')).toBeInTheDocument();
    expect(screen.getByText(/Демо-организатор/)).toBeInTheDocument();
  });

  it('calls API login and triggers success callback', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'organizer' },
      csrf_token: 'csrf-abc',
      expires_at: '2026-12-31T23:59:59Z',
    });

    render(<AuthView lang="ru" onLoginSuccess={mockOnLoginSuccess} onNotify={mockOnNotify} />);

    const emailInput = screen.getByPlaceholderText('alexey@ttk.ru');
    const passwordInput = screen.getByPlaceholderText(/••••/);
    const loginButton = screen.getByRole('button', { name: /Войти/ });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
  });

  it('shows error notification on login failure', async () => {
    vi.mocked(apiClient.login).mockRejectedValue({
      status: 401,
      message: 'Invalid credentials',
    });

    render(<AuthView lang="ru" onLoginSuccess={mockOnLoginSuccess} onNotify={mockOnNotify} />);

    const emailInput = screen.getByPlaceholderText('alexey@ttk.ru');
    const passwordInput = screen.getByPlaceholderText(/••••/);
    const loginButton = screen.getByRole('button', { name: /Войти/ });

    fireEvent.change(emailInput, { target: { value: 'bad@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'bad@example.com' }),
        false
      );
    });
  });

  it('validates empty fields before login', () => {
    render(<AuthView lang="ru" onLoginSuccess={mockOnLoginSuccess} onNotify={mockOnNotify} />);

    const emailInput = screen.getByPlaceholderText('alexey@ttk.ru');
    const loginButton = screen.getByRole('button', { name: /Войти/ });

    fireEvent.change(emailInput, { target: { value: '' } });
    fireEvent.click(loginButton);

    expect(mockOnNotify).toHaveBeenCalledWith(expect.stringContaining('Заполните'));
    expect(apiClient.login).not.toHaveBeenCalled();
  });

  it('fills demo credentials on hint button click', () => {
    render(<AuthView lang="ru" onLoginSuccess={mockOnLoginSuccess} onNotify={mockOnNotify} />);

    const hintButton = screen.getByText('Подставить');
    fireEvent.click(hintButton);

    const emailInput = screen.getByPlaceholderText('alexey@ttk.ru') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(/••••/) as HTMLInputElement;

    expect(emailInput.value).toBe('alexey@ttk.ru');
    expect(passwordInput.value).toBe('ttkmap-organizer-2026');
  });
});

describe('AdminView', () => {
  const mockProps = {
    lang: 'ru' as const,
    darkMode: false,
    isAuthenticated: true,
    currentSpace: {
      mapId: 'space-1',
      slug: 'test-slug',
      name: 'Test Space',
      pois: [],
    } as any,
    organizerMap: {
      snapshot: {
        id: 'map-1',
        slug: 'stable-slug-abc',
        revision: 1,
        width_units: 500,
        height_units: 500,
        updated_at: '2026-01-01T00:00:00Z',
        document: {
          title: 'Test Map',
          description: '',
          is_published: false,
          scale_m_per_unit: null,
          max_walk_gap_units: 50,
          background_asset_id: null,
          shapes: [],
          nodes: [],
          edges: [],
          pois: [],
          panoramas: [],
          hotspots: [],
        },
        assets: [],
      },
      owner_id: 'owner-1',
      created_at: '2026-01-01T00:00:00Z',
    },
    ownedMaps: [],
    mapDoc: {
      title: 'Test Map',
      description: '',
      is_published: false,
      scale_m_per_unit: null,
      max_walk_gap_units: 50,
      background_asset_id: null,
      shapes: [],
      nodes: [],
      edges: [],
      pois: [],
      panoramas: [],
      hotspots: [],
    },
    versionConflictRevision: null,
    onSelectOwnedMap: vi.fn(),
    onCreateNewMap: vi.fn(),
    onChangeDocument: vi.fn(),
    onSaveDocument: vi.fn(),
    onReloadAfterConflict: vi.fn(),
    onOpenHotspotEditor: vi.fn(),
    onNotify: vi.fn(),
  };

  it('renders admin panel header', () => {
    render(<AdminView {...mockProps} />);
    expect(screen.getByText(/Панель администратора/)).toBeInTheDocument();
  });

  it('shows draft status when map is not published', () => {
    render(<AdminView {...mockProps} />);
    expect(screen.getByText(/Черновик/)).toBeInTheDocument();
  });

  it('shows published status when map is published', () => {
    const publishedProps = {
      ...mockProps,
      mapDoc: { ...mockProps.mapDoc, is_published: true },
    };
    render(<AdminView {...publishedProps} />);
    expect(screen.getByText(/Опубликовано/)).toBeInTheDocument();
  });

  it('displays stable public link and iframe snippet when published', () => {
    const publishedProps = {
      ...mockProps,
      mapDoc: { ...mockProps.mapDoc, is_published: true },
    };
    render(<AdminView {...publishedProps} />);

    const shareButton = screen.getByRole('button', { name: /Поделиться/ });
    fireEvent.click(shareButton);

    expect(screen.getByText(/Стабильная публичная ссылка/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\/m\/stable-slug-abc/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/<iframe.*stable-slug-abc/)).toBeInTheDocument();
  });

  it('blocks publish when no POIs exist', async () => {
    render(<AdminView {...mockProps} />);

    const publishButton = screen.getByRole('button', { name: /Черновик/ });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(mockProps.onNotify).toHaveBeenCalledWith(
        expect.stringContaining('добавьте хотя бы одну точку')
      );
      expect(mockProps.onSaveDocument).not.toHaveBeenCalled();
    });
  });

  it('shows 412 version conflict alert with reload button', () => {
    const conflictProps = { ...mockProps, versionConflictRevision: 5 };
    render(<AdminView {...conflictProps} />);

    expect(screen.getByText(/Конфликт версий/)).toBeInTheDocument();
    expect(screen.getByText(/ревизия 5/)).toBeInTheDocument();

    const reloadButton = screen.getByRole('button', { name: /Загрузить актуальную версию/ });
    fireEvent.click(reloadButton);

    expect(mockProps.onReloadAfterConflict).toHaveBeenCalled();
  });

  it('slug remains stable across updates', () => {
    const publishedProps = {
      ...mockProps,
      mapDoc: { ...mockProps.mapDoc, is_published: true },
    };
    render(<AdminView {...publishedProps} />);

    const shareButton = screen.getByRole('button', { name: /Поделиться/ });
    fireEvent.click(shareButton);

    expect(screen.getByText(/Slug неизменен при обновлениях/)).toBeInTheDocument();
    expect(screen.getByText(/stable-slug-abc/)).toBeInTheDocument();
  });
});
