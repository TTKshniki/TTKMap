import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Capture } from '../../../../CONTRACTS/types';

vi.mock('../../shared/Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));

function frame(index: number) {
  return { index, sha256: 'a'.repeat(64), width_px: 600, height_px: 800 };
}

function makeCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: 'cap-1',
    map_id: 'map-1',
    title: 'Панорама зала',
    x: 350,
    y: 250,
    hfov_hint_deg: 65,
    state: 'collecting',
    progress: 0,
    attempt: 0,
    frames: [],
    result_asset_id: null,
    error_code: null,
    error_message: null,
    created_at: '2026-10-24T08:00:00Z',
    updated_at: '2026-10-24T08:00:00Z',
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

const apiState: {
  capture: Capture | null;
  createError: Error | null;
  uploadError: Error | null;
  getCapture: Capture | null;
} = { capture: null, createError: null, uploadError: null, getCapture: null };

vi.mock('../../shared/api', () => {
  class ApiClientError extends Error {
    readonly status: number;
    constructor(status: number, message = 'error') {
      super(message);
      this.status = status;
      this.name = 'ApiClientError';
    }
  }
  return {
    ApiClientError,
    apiClient: {
      createCapture: vi.fn(async (_mapId: string, input: { title: string; x: number; y: number }) => {
        if (apiState.createError) throw apiState.createError;
        apiState.capture = makeCapture({ title: input.title, x: input.x, y: input.y });
        return apiState.capture;
      }),
      uploadCaptureFrame: vi.fn(async (_mapId: string, _id: string, index: number) => {
        if (apiState.uploadError) throw apiState.uploadError;
        const existing = apiState.capture?.frames ?? [];
        apiState.capture = makeCapture({
          ...(apiState.capture ?? {}),
          frames: [...existing.filter((item) => item.index !== index), frame(index)].sort((a, b) => a.index - b.index),
        });
        return apiState.capture;
      }),
      startStitch: vi.fn(async () => {
        apiState.capture = makeCapture({ state: 'queued', attempt: 1 });
        return apiState.capture;
      }),
      cancelCapture: vi.fn(async () => {
        apiState.capture = makeCapture({ state: 'cancelled' });
        return apiState.capture;
      }),
      getCapture: vi.fn(async () => apiState.getCapture ?? apiState.capture),
      listAssets: vi.fn(async () => []),
      uploadAsset: vi.fn(async () => ({ id: 'asset-1' })),
    },
  };
});

const { CaptureGuide } = await import('./CaptureGuide');
const { apiClient } = await import('../../shared/api');
const { clearSession } = await import('./session');

const captureFrame = vi.fn(async (index: number) => new File([`frame-${index}`], `frame-${index}.jpg`, { type: 'image/jpeg' }));

/** Waits until the camera is live and the next frame button is clickable. */
async function awaitCapturing(index: number) {
  await waitFor(() => expect(screen.getByRole('button', { name: `Снять кадр ${index}` })).toBeEnabled());
}

/** Waits for the mount-time restore of a seeded session to land. */
async function awaitRestore() {
  expect(await screen.findByText(/Сессия восстановлена/)).toBeInTheDocument();
}

/** Seeds a server-side session that the component restores on mount. */
function seedSession(capture: Capture) {
  apiState.capture = capture;
  apiState.getCapture = capture;
  localStorage.setItem(
    'ttkmap.capture.map-1',
    JSON.stringify({
      captureId: capture.id,
      mapId: capture.map_id,
      title: capture.title,
      x: capture.x,
      y: capture.y,
      savedAt: new Date().toISOString(),
    }),
  );
}

function baseProps() {
  return {
    mapId: 'map-1',
    isAuthenticated: true,
    onNotify: vi.fn(),
    onPanoramaAssetReady: vi.fn(),
    captureFrame,
    pollMs: 10,
  };
}

const testStorageMap = new Map<string, string>();
const testStorage: Storage = {
  get length() { return testStorageMap.size; },
  clear: () => testStorageMap.clear(),
  getItem: (key: string) => testStorageMap.get(key) ?? null,
  key: (index: number) => Array.from(testStorageMap.keys())[index] ?? null,
  removeItem: (key: string) => void testStorageMap.delete(key),
  setItem: (key: string, value: string) => void testStorageMap.set(key, String(value)),
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

function stubObjectUrls() {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', configurable: true });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  }
}

function enableCamera() {
  stubObjectUrls();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
    configurable: true,
  });
}

function disableCamera() {
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  Object.defineProperty(window.navigator, 'mediaDevices', { value: undefined, configurable: true });
}

describe('CaptureGuide', () => {
  beforeEach(() => {
    apiState.capture = null;
    apiState.createError = null;
    apiState.uploadError = null;
    apiState.getCapture = null;
    captureFrame.mockClear();
    localStorage.clear();
    vi.clearAllMocks();
    enableCamera();
  });

  afterEach(() => {
    clearSession('map-1');
    disableCamera();
  });

  it('lets the organizer place the capture point on the plan instead of typing coordinates', () => {
    const props = baseProps();
    render(<CaptureGuide {...props} widthUnits={700} heightUnits={500} />);

    expect(screen.getByTestId('capture-point-picker')).toBeInTheDocument();
    expect(screen.getByTestId('capture-point-coords')).toHaveTextContent('X 350.0 · Y 250.0');
    fireEvent.click(screen.getByTestId('capture-point-picker'));
    expect(screen.getByTestId('capture-point-coords')).not.toHaveTextContent('X 350.0 · Y 250.0');
  });

  it('explains that HTTPS is required when the camera cannot start', () => {
    disableCamera();
    render(<CaptureGuide {...baseProps()} />);

    expect(screen.getByText(/HTTPS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Активировать камеру/ })).toBeDisabled();
  });

  it('shows the 22.5 degree guide and the frame counter after the camera starts', async () => {
    render(<CaptureGuide {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));

    await awaitCapturing(1);
    expect(screen.getByTestId('compass-guidance')).toBeInTheDocument();
    expect(screen.getByText(/Снято 0\/16 · шаг 22.5°/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Снять кадр 1/ })).toBeInTheDocument();
  });

  it('shows a preview and lets the organizer retake a bad frame', async () => {
    render(<CaptureGuide {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));
    await awaitCapturing(1);

    fireEvent.click(screen.getByRole('button', { name: /Снять кадр 1/ }));

    expect(await screen.findByAltText('Кадр 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Переснять' }));

    await waitFor(() => expect(screen.queryByAltText('Кадр 1')).toBeNull());
    expect(apiClient.uploadCaptureFrame).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Снять кадр 1/ })).toBeInTheDocument();
  });

  it('creates the capture session on the first frame and uploads accepted frames in order', async () => {
    render(<CaptureGuide {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));
    await awaitCapturing(1);

    fireEvent.click(screen.getByRole('button', { name: /Снять кадр 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Оставить кадр' }));

    await waitFor(() => expect(apiClient.createCapture).toHaveBeenCalledTimes(1));
    expect(apiClient.createCapture).toHaveBeenCalledWith('map-1', {
      title: 'Панорама зала',
      x: 350,
      y: 250,
      hfov_hint_deg: 65,
    });
    await waitFor(() => expect(apiClient.uploadCaptureFrame).toHaveBeenCalledWith('map-1', 'cap-1', 0, expect.anything()));

    await waitFor(() => expect(screen.getByText(/Снято 1\/16/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Снять кадр 2/ })).toBeInTheDocument();
  });

  it('queues the stitch automatically after the sixteenth frame', async () => {
    seedSession(makeCapture({ frames: Array.from({ length: 15 }, (_, index) => frame(index)) }));
    render(<CaptureGuide {...baseProps()} />);
    await awaitRestore();
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));

    await awaitCapturing(16);
    fireEvent.click(screen.getByRole('button', { name: /Снять кадр 16/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Оставить кадр' }));

    await waitFor(() => expect(apiClient.startStitch).toHaveBeenCalledWith('map-1', 'cap-1'));
    expect(await screen.findByText('В очереди на склейку')).toBeInTheDocument();
  });

  it('restores an unfinished series from the server after a reload', async () => {
    seedSession(makeCapture({ x: 12, y: 34, frames: [frame(0), frame(1), frame(2)] }));

    render(<CaptureGuide {...baseProps()} />);

    await waitFor(() => expect(apiClient.getCapture).toHaveBeenCalledWith('map-1', 'cap-1'));
    expect(await screen.findByText(/Сессия восстановлена: 3\/16/)).toBeInTheDocument();
    expect(screen.getByTestId('capture-point-coords')).toHaveTextContent('X 12.0 · Y 34.0');
  });

  it('keeps shooting when a slow session restore resolves mid-shoot', async () => {
    seedSession(makeCapture({ frames: [frame(0), frame(1)] }));
    let resolveRestore: (value: Capture) => void = () => {};
    const slow = new Promise<Capture>((resolve) => {
      resolveRestore = resolve;
    });
    (apiClient.getCapture as unknown as { mockReturnValueOnce: (value: Promise<Capture>) => void }).mockReturnValueOnce(slow);

    render(<CaptureGuide {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument());

    resolveRestore(makeCapture({ frames: [frame(0), frame(1)] }));
    await Promise.resolve();

    // The late restore must not drop the running camera back to the idle screen.
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Снять кадр 1/ })).toBeInTheDocument();
  });

  it('drops a stored session that no longer exists on the server', async () => {
    localStorage.setItem(
      'ttkmap.capture.map-1',
      JSON.stringify({ captureId: 'gone', mapId: 'map-1', title: 'x', x: 0, y: 0, savedAt: new Date().toISOString() }),
    );
    const { apiClient: api } = await import('../../shared/api');
    (api.getCapture as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error('404'));

    render(<CaptureGuide {...baseProps()} />);

    await waitFor(() => expect(localStorage.getItem('ttkmap.capture.map-1')).toBeNull());
  });

  it('shows a failed stitch with a recovery hint, a retry and a ready-sphere fallback', async () => {
    seedSession(
      makeCapture({
        state: 'failed',
        attempt: 1,
        progress: 80,
        error_code: 'INSUFFICIENT_COVERAGE',
        error_message: 'Measured coverage is below 40 degrees',
      }),
    );
    render(<CaptureGuide {...baseProps()} />);

    expect(await screen.findByText(/Сфера покрыта не полностью/)).toBeInTheDocument();
    expect(screen.getByText(/Measured coverage/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Загрузить готовую сферу/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Повторить склейку/ }));
    await waitFor(() => expect(apiClient.startStitch).toHaveBeenCalledWith('map-1', 'cap-1'));
  });

  it('hides the retry once both stitch attempts are spent', async () => {
    seedSession(makeCapture({ state: 'failed', attempt: 2, error_code: 'TIMEOUT' }));
    render(<CaptureGuide {...baseProps()} />);

    await screen.findByText(/превысила лимит времени/);
    expect(screen.queryByRole('button', { name: /Повторить склейку/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Загрузить готовую сферу/ })).toBeInTheDocument();
  });

  it('reports a rejected frame upload without losing the series', async () => {
    seedSession(makeCapture({ frames: [frame(0)] }));
    const { ApiClientError } = await import('../../shared/api');
    apiState.uploadError = new (ApiClientError as unknown as new (status: number, message: string) => Error)(413, 'Кадр слишком большой');

    render(<CaptureGuide {...baseProps()} />);
    await awaitRestore();
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));
    await awaitCapturing(2);
    fireEvent.click(screen.getByRole('button', { name: /Снять кадр 2/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Оставить кадр' }));

    expect(await screen.findByText('Кадр слишком большой')).toBeInTheDocument();
    // The series is not lost: the next target is still frame 2.
    expect(screen.getByRole('button', { name: /Снять кадр 2/ })).toBeInTheDocument();
  });

  it('cancels the capture session and stops the camera', async () => {
    seedSession(makeCapture());
    render(<CaptureGuide {...baseProps()} />);
    await awaitRestore();
    fireEvent.click(screen.getByRole('button', { name: /Активировать камеру/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Отмена' }));

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(apiClient.cancelCapture).toHaveBeenCalledWith('map-1', 'cap-1'));
    expect(await screen.findByText('Съёмка отменена')).toBeInTheDocument();
  });

  it('uploads a ready 2:1 sphere as an alternative and links it to the chosen point', async () => {
    const props = baseProps();
    render(<CaptureGuide {...props} />);

    const input = screen.getByLabelText('Загрузить готовую панораму') as HTMLInputElement;
    const file = new File(['sphere'], 'sphere.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(apiClient.uploadAsset).toHaveBeenCalledWith('map-1', { kind: 'panorama', file }));
    expect(props.onPanoramaAssetReady).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }), 'Панорама зала', 350, 250);
  });

  it('refuses to upload without an organizer session', async () => {
    const props = { ...baseProps(), isAuthenticated: false };
    render(<CaptureGuide {...props} mapId={null} />);

    const input = screen.getByLabelText('Загрузить готовую панораму') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(screen.getByText(/Войдите как организатор/)).toBeInTheDocument());
    expect(apiClient.uploadAsset).not.toHaveBeenCalled();
  });
});
