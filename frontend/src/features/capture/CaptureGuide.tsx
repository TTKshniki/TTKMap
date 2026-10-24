import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRef, Capture, MapDocument } from '../../../../CONTRACTS/types';
import { ApiClientError, apiClient } from '../../shared/api';
import { Icon } from '../../shared/Icon';
import { CapturePointPicker } from './CapturePointPicker';
import {
  CAPTURE_PHASE_LABELS,
  STEP_DEG,
  TOTAL_FRAMES,
  canRetry,
  captureErrorHint,
  captureStateLabel,
  compassGuidance,
  detectCameraSupport,
  detectOrientationSupport,
  nextFrameIndex,
  shootingProgress,
  targetAngleFor,
  type CapturePhase,
  type CompassGuidance,
} from './guide';
import { clearSession, loadSession, saveSession } from './session';
import { missingFrameIndexes, uploadFramesSequentially } from './uploadQueue';
import './capture.css';

export interface CaptureGuideProps {
  mapId: string | null;
  isAuthenticated: boolean;
  onNotify: (msg: string) => void;
  onPanoramaAssetReady?: (asset: AssetRef, title: string, x: number, y: number) => void;
  /** Optional plan data: enables tap-to-place coordinates instead of raw X/Y inputs. */
  mapDocument?: MapDocument | null;
  widthUnits?: number;
  heightUnits?: number;
  /** Polling interval for the server job; shortened in tests. */
  pollMs?: number;
  /** Injects frame encoding, so the component is testable without a canvas. */
  captureFrame?: (index: number) => Promise<File>;
}

type Notice = { text: string; tone: 'info' | 'warning' | 'error' } | null;

const DEFAULT_HFOV = 65;

async function encodeFrameFromVideo(video: HTMLVideoElement | null, index: number): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (context) {
    if (video && video.readyState >= 2) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      context.fillStyle = '#0f172a';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((value) => resolve(value ?? new Blob([], { type: 'image/jpeg' })), 'image/jpeg', 0.9),
  );
  return new File([blob], `capture-frame-${String(index).padStart(2, '0')}.jpg`, { type: 'image/jpeg' });
}

export const CaptureGuide: React.FC<CaptureGuideProps> = ({
  mapId,
  isAuthenticated,
  onNotify,
  onPanoramaAssetReady,
  mapDocument = null,
  widthUnits = 700,
  heightUnits = 500,
  pollMs = 2000,
  captureFrame,
}) => {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [title, setTitle] = useState('Панорама зала');
  const [point, setPoint] = useState({ x: 350, y: 250 });
  const [activeCapture, setActiveCapture] = useState<Capture | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pendingFrame, setPendingFrame] = useState<{ index: number; file: File; url: string } | null>(null);
  const [pendingUploads, setPendingUploads] = useState<number[]>([]);
  const [isUploadingPano, setIsUploadingPano] = useState(false);
  const [orientationGranted, setOrientationGranted] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readyPanoInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  // Mirrors `activeCapture` so the async session restore can tell whether the
  // organizer already started shooting while `getCapture` was still in flight.
  const activeCaptureRef = useRef<Capture | null>(null);
  const phaseRef = useRef<CapturePhase>('idle');

  const cameraSupport = useMemo(() => detectCameraSupport(), []);
  const orientationSupport = useMemo(() => detectOrientationSupport(), []);

  const frames = activeCapture?.frames ?? [];
  const nextIndex = nextFrameIndex(frames);
  const covered = frames.length;
  const guide: CompassGuidance = compassGuidance(targetAngleFor(nextIndex), headingDeg);
  const progress = shootingProgress(frames);

  activeCaptureRef.current = activeCapture;
  phaseRef.current = phase;

  const pushNotice = useCallback((text: string, tone: 'info' | 'warning' | 'error' = 'info') => {
    setNotice({ text, tone });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  /* --------------------------- lifecycle --------------------------- */

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (pendingFrame) URL.revokeObjectURL(pendingFrame.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compass guidance for the 22.5° step.
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const handler = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha === 'number') setHeadingDeg(Math.round(event.alpha));
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, []);

  // Restore an unfinished session after a reload (phones love to reload tabs).
  useEffect(() => {
    if (!mapId || !isAuthenticated) return;
    const stored = loadSession(mapId);
    if (!stored) return;
    let cancelled = false;
    (async () => {
      try {
        const restored = await apiClient.getCapture(mapId, stored.captureId);
        if (cancelled) return;
        // The organizer may have already opened the camera or created a fresh
        // session while this request was in flight: never clobber that.
        if (activeCaptureRef.current || phaseRef.current !== 'idle') return;
        setActiveCapture(restored);
        setTitle(restored.title);
        setPoint({ x: restored.x, y: restored.y });
        setPhase(restored.state === 'queued' || restored.state === 'running' ? 'queued' : 'idle');
        if (restored.state === 'collecting') {
          pushNotice(
            `Сессия восстановлена: ${restored.frames.length}/${TOTAL_FRAMES} кадров уже загружено`,
            'info',
          );
        }
      } catch {
        clearSession(mapId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, isAuthenticated, pushNotice]);

  // Poll the server job and hand the finished sphere to the plan editor.
  useEffect(() => {
    if (!mapId || !activeCapture) return;
    if (activeCapture.state !== 'queued' && activeCapture.state !== 'running') return;

    const timer = window.setInterval(async () => {
      try {
        const updated = await apiClient.getCapture(mapId, activeCapture.id);
        setActiveCapture(updated);
        if (updated.state === 'succeeded' && updated.result_asset_id) {
          setPhase('idle');
          clearSession(mapId);
          pushNotice('Склейка завершена: панорама привязана к точке на плане', 'info');
          const assets = await apiClient.listAssets(mapId);
          const asset = assets.find((item) => item.id === updated.result_asset_id);
          if (asset) onPanoramaAssetReady?.(asset, updated.title, updated.x, updated.y);
        } else if (updated.state === 'failed') {
          setPhase('idle');
          pushNotice(captureErrorHint(updated.error_code), 'error');
        }
      } catch {
        // Transient network error: keep polling the durable queue.
      }
    }, pollMs);

    return () => window.clearInterval(timer);
  }, [mapId, activeCapture, pollMs, onPanoramaAssetReady, pushNotice]);

  /* --------------------------- camera --------------------------- */

  const requestOrientationPermission = useCallback(async () => {
    if (orientationSupport !== 'permission-needed') {
      setOrientationGranted(true);
      return;
    }
    try {
      const request = (
        window.DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
      ).requestPermission;
      const result = await request();
      setOrientationGranted(result === 'granted');
      if (result !== 'granted') pushNotice('Компас отключён: ориентируйтесь на счётчик шага', 'warning');
    } catch {
      setOrientationGranted(false);
    }
  }, [orientationSupport, pushNotice]);

  const startCamera = useCallback(async () => {
    if (!cameraSupport.usable) {
      setCameraError(cameraSupport.reason);
      return;
    }
    setCameraError(null);
    setPhase('preparing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1440 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      await requestOrientationPermission();
      setPhase('capturing');
      pushNotice('Держите телефон вертикально и поворачивайтесь на 22,5° после каждого кадра', 'info');
    } catch {
      setPhase('idle');
      setCameraError(
        'Доступ к камере отклонён. Разрешите камеру в настройках браузера или загрузите готовую сферу 2:1.',
      );
    }
  }, [cameraSupport, pushNotice, requestOrientationPermission]);

  const ensureCapture = useCallback(async (): Promise<Capture | null> => {
    if (!mapId || !isAuthenticated) return null;
    if (activeCapture && activeCapture.state === 'collecting') return activeCapture;
    try {
      const created = await apiClient.createCapture(mapId, {
        title: title.trim() || 'Панорама 360°',
        x: point.x,
        y: point.y,
        hfov_hint_deg: DEFAULT_HFOV,
      });
      setActiveCapture(created);
      saveSession(mapId, { captureId: created.id, mapId, title: created.title, x: created.x, y: created.y });
      return created;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        pushNotice('На этой карте уже две активные сессии съёмки: завершите или отмените одну', 'warning');
      } else if (error instanceof ApiClientError) {
        pushNotice(error.message, 'error');
      } else {
        pushNotice('Не удалось создать сессию съёмки', 'error');
      }
      return null;
    }
  }, [activeCapture, isAuthenticated, mapId, point.x, point.y, pushNotice, title]);

  const shootFrame = useCallback(async () => {
    const index = nextFrameIndex(activeCapture?.frames ?? []);
    if (index >= TOTAL_FRAMES) return;
    const capture = activeCapture ?? (await ensureCapture());
    if (!capture) return;
    try {
      const encoder = captureFrame ?? ((value: number) => encodeFrameFromVideo(videoRef.current, value));
      const file = await encoder(index);
      setPendingFrame({ index, file, url: URL.createObjectURL(file) });
      setPhase('reviewing');
    } catch {
      pushNotice('Не удалось снять кадр: попробуйте ещё раз', 'error');
    }
  }, [activeCapture, captureFrame, ensureCapture, pushNotice]);

  const retakeFrame = useCallback(() => {
    if (pendingFrame) URL.revokeObjectURL(pendingFrame.url);
    setPendingFrame(null);
    setPhase('capturing');
    pushNotice('Кадр отменён: снимите его заново с тем же ориентиром', 'info');
  }, [pendingFrame, pushNotice]);

  const uploadFrame = useCallback(
    async (frame: { index: number; file: File }) => {
      const capture = activeCapture;
      if (!mapId || !capture) return;
      setPhase('uploading');
      setPendingUploads([frame.index]);
      try {
        const updated = await apiClient.uploadCaptureFrame(mapId, capture.id, frame.index, { file: frame.file });
        setActiveCapture(updated);
        setPendingUploads([]);
        const remaining = TOTAL_FRAMES - updated.frames.length;
        setPhase('capturing');
        if (remaining > 0) {
          pushNotice(
            `Кадр ${updated.frames.length}/${TOTAL_FRAMES} сохранён · следующий ориентир ${targetAngleFor(
              updated.frames.length,
            ).toFixed(1)}°`,
            'info',
          );
        } else {
          await submitStitch(updated);
        }
      } catch (error) {
        setPendingUploads([]);
        setPhase('capturing');
        pushNotice(
          error instanceof ApiClientError ? error.message : 'Не удалось загрузить кадр: проверьте связь',
          'error',
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCapture, mapId, pushNotice],
  );

  const acceptFrame = useCallback(async () => {
    if (!pendingFrame) return;
    const frame = { index: pendingFrame.index, file: pendingFrame.file };
    URL.revokeObjectURL(pendingFrame.url);
    setPendingFrame(null);
    await uploadFrame(frame);
  }, [pendingFrame, uploadFrame]);

  const submitStitch = useCallback(
    async (capture: Capture) => {
      if (!mapId) return;
      try {
        const queued = await apiClient.startStitch(mapId, capture.id);
        setActiveCapture(queued);
        setPhase('queued');
        stopStream();
        pushNotice('Все 16 кадров загружены: склейка запущена на сервере', 'info');
      } catch (error) {
        pushNotice(error instanceof ApiClientError ? error.message : 'Не удалось поставить склейку в очередь', 'error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapId, pushNotice, stopStream],
  );

  /** Re-sends frames that never reached the server after a broken connection. */
  const resumeUploads = useCallback(async () => {
    if (!mapId || !activeCapture) return;
    const missing = missingFrameIndexes(
      activeCapture.frames.map((frame) => frame.index),
      TOTAL_FRAMES,
    );
    if (missing.length === 0 || !captureFrame) {
      pushNotice('Все кадры уже на сервере — можно запускать склейку', 'info');
      return;
    }
    setPhase('uploading');
    setPendingUploads(missing);
    const result = await uploadFramesSequentially({
      upload: async (index) => apiClient.uploadCaptureFrame(mapId, activeCapture.id, index, { file: await captureFrame(index) }),
      indexes: missing,
      onFrameUploaded: (index) => setPendingUploads((prev) => prev.filter((item) => item !== index)),
    });
    setPendingUploads([]);
    const refreshed = await apiClient.getCapture(mapId, activeCapture.id);
    setActiveCapture(refreshed);
    setPhase('capturing');
    if (result.failedIndex !== null) {
      pushNotice(`Кадр ${result.failedIndex + 1} не загрузился: повторите восстановление очереди`, 'error');
    } else {
      pushNotice('Очередь восстановлена', 'info');
    }
  }, [activeCapture, captureFrame, mapId, pushNotice]);

  const retryStitch = useCallback(async () => {
    if (!mapId || !activeCapture) return;
    try {
      const retried = await apiClient.startStitch(mapId, activeCapture.id);
      setActiveCapture(retried);
      setPhase('queued');
      pushNotice('Повторная склейка поставлена в очередь', 'info');
    } catch (error) {
      pushNotice(error instanceof ApiClientError ? error.message : 'Не удалось перезапустить склейку', 'error');
    }
  }, [activeCapture, mapId, pushNotice]);

  const cancelCapture = useCallback(async () => {
    stopStream();
    setPhase('idle');
    if (!mapId || !activeCapture) return;
    try {
      const cancelled = await apiClient.cancelCapture(mapId, activeCapture.id);
      setActiveCapture(cancelled);
      clearSession(mapId);
      pushNotice('Сессия съёмки отменена', 'info');
    } catch (error) {
      pushNotice(error instanceof ApiClientError ? error.message : 'Не удалось отменить съёмку', 'error');
    }
  }, [activeCapture, mapId, pushNotice, stopStream]);

  const uploadReadyPanorama = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!mapId || !isAuthenticated) {
        pushNotice('Войдите как организатор, чтобы загрузить панораму', 'warning');
        return;
      }
      setIsUploadingPano(true);
      try {
        const asset = await apiClient.uploadAsset(mapId, { kind: 'panorama', file });
        onPanoramaAssetReady?.(asset, title.trim() || file.name, point.x, point.y);
        pushNotice('Готовая панорама 2:1 загружена и привязана к точке на плане', 'info');
      } catch (error) {
        pushNotice(
          error instanceof ApiClientError ? `${error.message} (требуется пропорция 2:1)` : 'Ошибка загрузки панорамы',
          'error',
        );
      } finally {
        setIsUploadingPano(false);
      }
    },
    [isAuthenticated, mapId, onPanoramaAssetReady, point.x, point.y, pushNotice, title],
  );

  /* --------------------------- render --------------------------- */

  const jobFailed = activeCapture?.state === 'failed';
  const jobActive = activeCapture?.state === 'queued' || activeCapture?.state === 'running';
  const showPicker = Boolean(mapId);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Icon name="camera" className="w-4 h-4 text-brand-600" /> 2. Мастер съемки панорам с телефона
          </h3>
          <p className="text-xs text-slate-400">
            Инструкция и гид по сшивке серий кадров (16 кадров • шаг 22.5°)
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 whitespace-nowrap">
          {CAPTURE_PHASE_LABELS[phase]}
        </span>
      </header>

      {showPicker && (
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название панорамы"
            aria-label="Название панорамы"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
          />
          <CapturePointPicker
            widthUnits={widthUnits}
            heightUnits={heightUnits}
            document={mapDocument}
            value={point}
            onChange={setPoint}
            existing={(mapDocument?.panoramas ?? []).map((panorama) => ({
              id: panorama.id,
              x: panorama.x,
              y: panorama.y,
              title: panorama.title,
            }))}
          />
        </div>
      )}

      {notice && (
        <div
          className={`ttk-capture-guide__notice ttk-capture-guide__notice--${
            notice.tone === 'error' ? 'error' : notice.tone === 'warning' ? 'warning' : 'info'
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {cameraError && (
        <div className="ttk-capture-guide__notice ttk-capture-guide__notice--warning" role="alert">
          {cameraError}
        </div>
      )}

      {!cameraSupport.usable && !cameraError && (
        <div className="ttk-capture-guide__notice ttk-capture-guide__notice--warning">
          {cameraSupport.reason}. Доступна загрузка готовой сферы 2:1.
        </div>
      )}

      {/* Shooting stage */}
      {(phase === 'capturing' || phase === 'reviewing' || phase === 'preparing' || phase === 'uploading') && (
        <div className="space-y-2">
          <div className="ttk-capture-guide__stage">
            {phase === 'reviewing' && pendingFrame ? (
              <img src={pendingFrame.url} alt={`Кадр ${pendingFrame.index + 1}`} />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            )}
            <div className="ttk-capture-guide__reticle" />
            <span
              className={`ttk-capture-guide__compass ${guide.aligned ? 'is-aligned' : ''}`}
              data-testid="compass-guidance"
            >
              {phase === 'reviewing'
                ? `Кадр ${(pendingFrame?.index ?? 0) + 1} из ${TOTAL_FRAMES} — проверьте кадр`
                : `${guide.text} · цель ${targetAngleFor(nextIndex).toFixed(1)}°`}
            </span>
          </div>

          <div className="ttk-capture-guide__dots" aria-hidden>
            {Array.from({ length: TOTAL_FRAMES }).map((_, index) => (
              <span
                key={index}
                className={`ttk-capture-guide__dot ${
                  index < covered ? 'is-done' : index === covered ? 'is-current' : ''
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] font-bold text-brand-600">
            <span>
              Снято {covered}/{TOTAL_FRAMES} · шаг {STEP_DEG}°
            </span>
            <span>{progress}%</span>
          </div>

          {phase === 'reviewing' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={acceptFrame}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-xl text-xs font-bold"
              >
                Оставить кадр
              </button>
              <button
                type="button"
                onClick={retakeFrame}
                className="flex-1 bg-slate-200 dark:bg-slate-700 py-2.5 rounded-xl text-xs font-bold"
              >
                Переснять
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void shootFrame()}
                disabled={phase === 'uploading' || phase === 'preparing'}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold"
              >
                {phase === 'uploading' ? 'Загрузка кадра…' : `Снять кадр ${nextIndex + 1}`}
              </button>
              <button
                type="button"
                onClick={() => void cancelCapture()}
                className="px-3 py-2.5 bg-slate-200 dark:bg-slate-700 rounded-xl text-xs font-semibold"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      )}

      {/* Start button */}
      {(phase === 'idle' || phase === 'queued') && (
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={!cameraSupport.usable}
          className="w-full bg-[#121824] hover:bg-slate-800 disabled:opacity-50 text-white py-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2"
        >
          <Icon name="video" className="w-4 h-4" /> Активировать камеру
        </button>
      )}

      {orientationSupport === 'permission-needed' && !orientationGranted && phase !== 'idle' && (
        <p className="text-[11px] text-slate-500">Разрешите доступ к датчикам, чтобы видеть подсказку компаса.</p>
      )}

      {/* Server job */}
      {activeCapture && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{captureStateLabel(activeCapture)}</span>
            <span className="text-slate-500">{activeCapture.progress}%</span>
          </div>
          {jobActive && (
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${activeCapture.progress}%` }} />
            </div>
          )}

          {jobFailed && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 space-y-2">
              <p className="font-semibold">{captureErrorHint(activeCapture.error_code)}</p>
              {activeCapture.error_message && <p className="opacity-80">{activeCapture.error_message}</p>}
              <div className="flex flex-wrap gap-2">
                {canRetry(activeCapture) && (
                  <button
                    type="button"
                    onClick={() => void retryStitch()}
                    className="px-3 py-1.5 bg-brand-600 text-white rounded-lg font-bold"
                  >
                    Повторить склейку (попытка {activeCapture.attempt + 1}/2)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => readyPanoInputRef.current?.click()}
                  className="px-3 py-1.5 bg-slate-800 text-white rounded-lg font-bold"
                >
                  Загрузить готовую сферу
                </button>
              </div>
            </div>
          )}

          {activeCapture.state === 'collecting' && covered < TOTAL_FRAMES && captureFrame && (
            <button
              type="button"
              onClick={() => void resumeUploads()}
              className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg font-semibold"
            >
              Восстановить очередь ({TOTAL_FRAMES - covered} кадров)
            </button>
          )}

          {pendingUploads.length > 0 && (
            <p className="text-[11px] text-slate-500">Загружаются кадры: {pendingUploads.join(', ')}</p>
          )}
        </div>
      )}

      {/* Ready panorama upload */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
        <input
          ref={readyPanoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Загрузить готовую панораму"
          onChange={(event) => void uploadReadyPanorama(event)}
        />
        <button
          type="button"
          onClick={() => readyPanoInputRef.current?.click()}
          disabled={isUploadingPano}
          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-brand-600 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Icon name="rotate-3d" className="w-4 h-4 text-brand-600" />
          <span>{isUploadingPano ? 'Загрузка сферы…' : 'Загрузить готовую 360° панораму (2:1)'}</span>
        </button>
      </div>
    </div>
  );
};
