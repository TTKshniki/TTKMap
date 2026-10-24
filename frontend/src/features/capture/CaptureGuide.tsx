import React, { useEffect, useRef, useState } from 'react';
import type { AssetRef, Capture } from '../../../../CONTRACTS/types';
import { apiClient, ApiClientError } from '../../shared/api';
import { Icon } from '../../shared/Icon';

export interface CaptureGuideProps {
  mapId: string | null;
  isAuthenticated: boolean;
  onNotify: (msg: string) => void;
  onPanoramaAssetReady?: (asset: AssetRef, title: string, x: number, y: number) => void;
}

const TOTAL_FRAMES = 16;
const STEP_DEG = 22.5;

export const CaptureGuide: React.FC<CaptureGuideProps> = ({
  mapId,
  isAuthenticated,
  onNotify,
  onPanoramaAssetReady,
}: CaptureGuideProps) => {
  const [isCapturingCamera, setIsCapturingCamera] = useState(false);
  const [capturedFramesCount, setCapturedFramesCount] = useState(0);
  const [activeCapture, setActiveCapture] = useState<Capture | null>(null);
  const [captureTitle, setCaptureTitle] = useState('Панорама зала');
  const [captureX, setCaptureX] = useState(350);
  const [captureY, setCaptureY] = useState(250);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUploadingPano, setIsUploadingPano] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readyPanoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.alpha === 'number') {
        setHeadingDeg(Math.round(e.alpha));
      }
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!mapId || !activeCapture) return;
    if (activeCapture.state !== 'queued' && activeCapture.state !== 'running') return;

    const timer = window.setInterval(async () => {
      try {
        const updated = await apiClient.getCapture(mapId, activeCapture.id);
        setActiveCapture(updated);
        if (updated.state === 'succeeded' && updated.result_asset_id) {
          onNotify('Сшивка панорамы 360° успешно завершена сервером!');
          const assets = await apiClient.listAssets(mapId);
          const found = assets.find((a) => a.id === updated.result_asset_id);
          if (found) {
            onPanoramaAssetReady?.(found, updated.title, updated.x, updated.y);
          }
        } else if (updated.state === 'failed') {
          onNotify(`Сшивка завершилась ошибкой (${updated.error_code}): выберите повтор или загрузите готовую сферу`);
        }
      } catch {
        // Keep polling on transient network error
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [mapId, activeCapture, onNotify, onPanoramaAssetReady]);

  const startCameraPanorama = async () => {
    setCameraError(null);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCapturingCamera(true);
        setCapturedFramesCount(0);

        if (mapId && isAuthenticated) {
          try {
            const created = await apiClient.createCapture(mapId, {
              title: captureTitle || 'Панорама 360°',
              x: captureX,
              y: captureY,
              hfov_hint_deg: 65,
            });
            setActiveCapture(created);
          } catch {
            // Local camera mode if session has 2 active captures already
          }
        }
        onNotify('Камера активирована. Сделайте 16 круговых кадров с шагом 22.5°.');
      } catch {
        setCameraError('Доступ к камере отклонён или требуется HTTPS. Вы можете загрузить готовую 360° панораму ниже.');
        onNotify('Ошибка доступа к камере');
      }
    } else {
      setCameraError('Камера не поддерживается браузером (требуется HTTPS). Используйте прямую загрузку панорамы 2:1.');
      onNotify('Камера не поддерживается устройством');
    }
  };

  const captureFrameBlob = async (stepIndex: number): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, 400, 600);
      } else {
        ctx.fillStyle = `hsl(${(stepIndex * 22) % 360}, 65%, 40%)`;
        ctx.fillRect(0, 0, 400, 600);
      }
    }
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b ?? new Blob([], { type: 'image/png' })), 'image/png'),
    );
    return new File([blob], `frame-${stepIndex}.png`, { type: 'image/png' });
  };

  const captureNextFrame = async () => {
    const nextIndex = capturedFramesCount;
    if (nextIndex >= TOTAL_FRAMES) return;

    try {
      if (mapId && isAuthenticated && activeCapture && activeCapture.state === 'collecting') {
        const frameFile = await captureFrameBlob(nextIndex);
        let updated: Capture | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            updated = await apiClient.uploadCaptureFrame(mapId, activeCapture.id, nextIndex, { file: frameFile });
            break;
          } catch (err) {
            if (attempt === 1) throw err;
          }
        }
        if (updated) {
          setActiveCapture(updated);
        }
      }

      const newCount = nextIndex + 1;
      setCapturedFramesCount(newCount);

      if (newCount < TOTAL_FRAMES) {
        onNotify(`Кадр ${newCount} / ${TOTAL_FRAMES} сохранен (повернитесь на ${(newCount * STEP_DEG).toFixed(1)}°)`);
      } else {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        setIsCapturingCamera(false);
        if (mapId && isAuthenticated && activeCapture) {
          const queued = await apiClient.startStitch(mapId, activeCapture.id);
          setActiveCapture(queued);
          onNotify('Все 16 кадров загружены! Запущена серверная очередь сшивки Hugin/enblend.');
        } else {
          onNotify('Серия из 16 кадров отснята (войдите как организатор для серверной сшивки).');
        }
      }
    } catch (err) {
      onNotify(err instanceof ApiClientError ? err.message : 'Ошибка загрузки кадра');
    }
  };

  const handleRetryStitch = async () => {
    if (!mapId || !activeCapture) return;
    try {
      const retried = await apiClient.startStitch(mapId, activeCapture.id);
      setActiveCapture(retried);
      onNotify('Повторная сшивка поставлена в очередь');
    } catch (err) {
      onNotify(err instanceof ApiClientError ? err.message : 'Не удалось перезапустить сшивку');
    }
  };

  const handleCancelCapture = async () => {
    if (!mapId || !activeCapture) return;
    try {
      const cancelled = await apiClient.cancelCapture(mapId, activeCapture.id);
      setActiveCapture(cancelled);
      setIsCapturingCamera(false);
      onNotify('Сессия съёмки отменена');
    } catch (err) {
      onNotify(err instanceof ApiClientError ? err.message : 'Не удалось отменить съёмку');
    }
  };

  const handleDirectPanoramaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!mapId || !isAuthenticated) {
      onNotify('Войдите как организатор для загрузки панорамы на сервер');
      return;
    }
    setIsUploadingPano(true);
    try {
      const uploaded = await apiClient.uploadAsset(mapId, { kind: 'panorama', file });
      onPanoramaAssetReady?.(uploaded, captureTitle || file.name, captureX, captureY);
      onNotify('Готовая панорама 360° (2:1) успешно загружена и привязана к плану!');
    } catch (err) {
      onNotify(err instanceof ApiClientError ? err.message : 'Ошибка загрузки панорамы (требуется пропорция 2:1)');
    } finally {
      setIsUploadingPano(false);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          2. Мастер съемки панорам с телефона
        </h3>
        <p className="text-xs text-slate-400">
          Инструкция и гид по сшивке серий кадров (16 кадров • шаг 22.5°)
        </p>
      </div>

      {/* Capture Point Coordinates & Title */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <input
          type="text"
          value={captureTitle}
          onChange={(e) => setCaptureTitle(e.target.value)}
          placeholder="Название панорамы"
          className="col-span-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
        />
        <input
          type="number"
          value={captureX}
          onChange={(e) => setCaptureX(Number(e.target.value))}
          placeholder="X на плане"
          className="col-span-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5"
        />
        <input
          type="number"
          value={captureY}
          onChange={(e) => setCaptureY(Number(e.target.value))}
          placeholder="Y на плане"
          className="col-span-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5"
        />
      </div>

      <div className="space-y-3">
        <button
          onClick={startCameraPanorama}
          className="w-full bg-[#121824] hover:bg-slate-800 text-white py-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2"
        >
          <Icon name="camera" className="w-4 h-4" /> Запустить помощник съемки
        </button>

        {cameraError && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
            {cameraError}
          </div>
        )}

        {isCapturingCamera && (
          <div className="space-y-3 text-center pt-2">
            <div className="relative mx-auto w-full max-w-xs h-44 bg-black rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* Ghost Alignment Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center border-2 border-dashed border-brand-500/60 m-3 rounded-lg">
                <span className="bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-full">
                  Целевой угол: {(capturedFramesCount * STEP_DEG).toFixed(1)}°
                  {headingDeg !== null ? ` • Компас: ${headingDeg}°` : ' • Держите телефон вертикально'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-bold text-brand-600 px-1">
              <span>
                Снято кадров: {capturedFramesCount} / {TOTAL_FRAMES}
              </span>
              <span>Шаг {(capturedFramesCount * STEP_DEG).toFixed(1)}°</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={captureNextFrame}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-xs font-bold transition"
              >
                Сделать следующий кадр
              </button>
              {activeCapture && (
                <button
                  onClick={handleCancelCapture}
                  className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs font-semibold"
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Capture Server Queue / Failed State with Recovery Action */}
        {activeCapture && (
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold">Статус задачи сшивки: {activeCapture.state}</span>
              <span className="text-slate-500">Прогресс: {activeCapture.progress}%</span>
            </div>
            {activeCapture.state === 'failed' && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 space-y-2">
                <p className="font-semibold">
                  Ошибка сшивки ({activeCapture.error_code}): {activeCapture.error_message}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeCapture.attempt < 2 && (
                    <button
                      onClick={handleRetryStitch}
                      className="px-3 py-1.5 bg-brand-600 text-white rounded-lg font-bold"
                    >
                      Повторить попытку ({activeCapture.attempt}/2)
                    </button>
                  )}
                  <button
                    onClick={() => readyPanoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-slate-800 text-white rounded-lg font-bold"
                  >
                    Загрузить готовую 360° сферу взамен
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alternative Direct 2:1 Equirectangular Panorama Upload */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <input
            ref={readyPanoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleDirectPanoramaUpload}
          />
          <button
            onClick={() => readyPanoInputRef.current?.click()}
            disabled={isUploadingPano}
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-brand-600 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2"
          >
            <Icon name="rotate-3d" className="w-4 h-4 text-brand-600" />
            <span>{isUploadingPano ? 'Загрузка сферы...' : 'Загрузить готовую 360° панораму (2:1)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
