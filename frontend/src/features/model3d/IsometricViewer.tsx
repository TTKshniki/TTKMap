import React, { lazy, Suspense } from 'react';
import type { IsometricViewerProps } from './IsometricViewerCanvas';
import './isometric.css';

const IsometricViewerCanvas = lazy(() =>
  import('./IsometricViewerCanvas').then((module) => ({ default: module.IsometricViewerCanvas })),
);

export type { IsometricViewerProps } from './IsometricViewerCanvas';

export const IsometricViewer: React.FC<IsometricViewerProps> = (props) => (
  <Suspense
    fallback={
      <div className={`ttk-isometric ${props.compact ? 'ttk-isometric--compact' : ''}`} data-testid="isometric-plan">
        <div className="ttk-isometric__loading" role="status">Загружаем 3D-просмотр…</div>
      </div>
    }
  >
    <IsometricViewerCanvas {...props} />
  </Suspense>
);
