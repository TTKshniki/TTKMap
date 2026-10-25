import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/api', () => {
  class ApiClientError extends Error {
    status: number;

    constructor(status: number) {
      super('request failed');
      this.status = status;
    }
  }
  return {
    ApiClientError,
    apiClient: {
      session: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    },
  };
});

vi.mock('../../shared/router', () => ({ navigate: vi.fn() }));

import { ApiClientError, apiClient } from '../../shared/api';
import { navigate } from '../../shared/router';
import { DesignPortal } from './DesignPortal';
import { SHOWCASE_MAP_SLUG } from '../../shared/showcase';

const organizerSession = {
  user: { id: 'd0c60d5e-818b-4eb3-bce2-21807f98d39e', email: 'organizer@example.org', role: 'organizer' as const },
  csrf_token: 'csrf',
  expires_at: '2026-10-24T12:00:00Z',
};

describe('Design portal backend wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.session).mockRejectedValue(new ApiClientError(401));
    vi.mocked(apiClient.login).mockResolvedValue(organizerSession);
    vi.mocked(apiClient.register).mockResolvedValue(organizerSession);
    vi.mocked(apiClient.logout).mockResolvedValue(undefined);
  });

  it('authenticates against the API and opens the organizer workspace', async () => {
    render(<DesignPortal />);

    await screen.findByText('Пространства и объекты');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: organizerSession.user.email } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти в систему' }));

    await waitFor(() => expect(apiClient.login).toHaveBeenCalledWith({
      email: organizerSession.user.email,
      password: 'long-enough-password',
    }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/organize'));
  });

  it('opens the canonical expert demo without requiring sign-in', async () => {
    render(<DesignPortal />);
    await screen.findByText('Пространства и объекты');
    fireEvent.click(screen.getByRole('button', { name: /Показать эталонную демо-карту/ }));
    expect(navigate).toHaveBeenCalledWith(`/m/${SHOWCASE_MAP_SLUG}`);
    expect(apiClient.login).not.toHaveBeenCalled();
  });

  it('opens a pasted public map slug from the shared search box', async () => {
    render(<DesignPortal />);
    await screen.findByText('Пространства и объекты');
    fireEvent.change(screen.getByLabelText('Ссылка или код карты'), {
      target: { value: `https://map.test/m/${SHOWCASE_MAP_SLUG}` },
    });
    fireEvent.submit(screen.getByLabelText('Ссылка или код карты').closest('form')!);
    expect(navigate).toHaveBeenCalledWith(`/m/${SHOWCASE_MAP_SLUG}`);
  });

  it('registers a new business user and redirects directly to organizer workspace', async () => {
    render(<DesignPortal />);

    await screen.findByText('Пространства и объекты');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    // Switch tab to registration
    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'business@example.org' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secure-corporate-password-123' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'secure-corporate-password-123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    await waitFor(() => expect(apiClient.register).toHaveBeenCalledWith({
      email: 'business@example.org',
      password: 'secure-corporate-password-123',
    }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/organize'));
  });

  it('keeps regular users in user cabinet without access to the editor', async () => {
    render(<DesignPortal />);

    await screen.findByText('Пространства и объекты');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    // Select "Пользователь" account role
    fireEvent.click(screen.getByRole('button', { name: /Пользователь/ }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'visitor@example.org' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'visitor-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти в систему' }));

    await waitFor(() => expect(apiClient.login).toHaveBeenCalledWith({
      email: 'visitor@example.org',
      password: 'visitor-password-123',
    }));

    // Must NOT navigate to organizer workspace
    expect(navigate).not.toHaveBeenCalledWith('/organize');

    // Should display User cabinet with "Пользователь" badge and WITHOUT "Управлять картами" button
    await screen.findByText('Пользователь');
    expect(screen.queryByText('Управлять картами')).not.toBeInTheDocument();
  });

  it('blocks registration when password is weak or contains login tokens', async () => {
    render(<DesignPortal />);

    await screen.findByText('Пространства и объекты');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kriper2010@example.org' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'MySecret2010!#' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'MySecret2010!#' } });

    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(apiClient.register).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/2010/);
  });
});
