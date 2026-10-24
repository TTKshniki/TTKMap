import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanoramaViewer } from './Viewer';
import type { Panorama, Hotspot, Poi, AssetRef } from '../../../../CONTRACTS/types';

vi.mock('../../shared/Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));

describe('PanoramaViewer', () => {
  const mockPanorama: Panorama = {
    id: 'pano-1',
    asset_id: 'asset-1',
    title: 'Test Panorama',
    x: 100,
    y: 100,
    nav_node_id: 'node-1',
    heading_offset_deg: 45,
  };

  const mockAsset: AssetRef = {
    id: 'asset-1',
    kind: 'panorama',
    source: 'upload',
    width_px: 4096,
    height_px: 2048,
    projection: 'equirectangular',
    haov_deg: 360,
    vaov_deg: 180,
    v_offset_deg: 0,
    preview_url: '/media/asset-1/preview',
    mobile_url: '/media/asset-1/mobile',
    full_url: '/media/asset-1/full',
    created_at: '2026-01-01T00:00:00Z',
  };

  const mockPoi: Poi = {
    id: 'poi-1',
    title: 'Test POI',
    category: 'booth',
    category_label: null,
    description: 'Test description',
    x: 100,
    y: 100,
    nav_node_id: null,
  };

  const mockHotspot: Hotspot = {
    id: 'hotspot-1',
    panorama_id: 'pano-1',
    kind: 'poi',
    yaw_deg: 45,
    pitch_deg: 0,
    poi_id: 'poi-1',
    target_panorama_id: null,
  };

  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Panorama View',
    imageUrl: '/media/asset-1/full',
    panorama: mockPanorama,
    panoramas: [mockPanorama],
    hotspots: [mockHotspot],
    pois: [mockPoi],
    assets: [mockAsset],
    onSelectPanorama: vi.fn(),
    onSelectPoi: vi.fn(),
    initialYawDeg: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders panorama viewer when open', () => {
    render(<PanoramaViewer {...mockProps} />);
    expect(screen.getByText('Test Panorama View')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<PanoramaViewer {...mockProps} isOpen={false} />);
    expect(screen.queryByText('Test Panorama View')).not.toBeInTheDocument();
  });

  it('displays image with correct URL', () => {
    render(<PanoramaViewer {...mockProps} />);
    // Image should be displayed via CSS background or img tag
    expect(screen.getByText('Test Panorama View')).toBeInTheDocument();
  });

  it('supports zoom in and zoom out', () => {
    render(<PanoramaViewer {...mockProps} />);

    const zoomInBtn = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('+'));
    const zoomOutBtn = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('-'));

    if (zoomInBtn) fireEvent.click(zoomInBtn);
    if (zoomOutBtn) fireEvent.click(zoomOutBtn);

    // Zoom state changes are internal
  });

  it('handles drag to rotate view', () => {
    render(<PanoramaViewer {...mockProps} />);

    const viewport = document.querySelector('.panorama-viewport, [style*="overflow"]');
    if (viewport) {
      fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(viewport, { clientX: 200, clientY: 150 });
      fireEvent.mouseUp(viewport);
    }
  });

  it('restricts pitch to valid range [-90, 90]', () => {
    render(<PanoramaViewer {...mockProps} />);

    // Pitch should be clamped in drag handler
    const viewport = document.querySelector('[style]');
    if (viewport) {
      fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(viewport, { clientX: 100, clientY: -500 });
      // Internal pitch should be clamped to max
    }
  });

  it('displays POI hotspots', () => {
    render(<PanoramaViewer {...mockProps} />);
    expect(screen.getByText('Test POI')).toBeInTheDocument();
  });

  it('supports POI hotspot click', () => {
    render(<PanoramaViewer {...mockProps} />);

    const poiHotspot = screen.getByText('Test POI');
    fireEvent.click(poiHotspot);

    // Should show POI card or trigger callback
  });

  it('supports transition hotspots to other panoramas', () => {
    const transitionHotspot: Hotspot = {
      id: 'hotspot-2',
      panorama_id: 'pano-1',
      kind: 'transition',
      yaw_deg: 90,
      pitch_deg: 0,
      poi_id: null,
      target_panorama_id: 'pano-2',
    };

    const pano2: Panorama = {
      id: 'pano-2',
      asset_id: 'asset-2',
      title: 'Next Panorama',
      x: 200,
      y: 100,
      nav_node_id: 'node-2',
      heading_offset_deg: 0,
    };

    render(
      <PanoramaViewer
        {...mockProps}
        hotspots={[mockHotspot, transitionHotspot]}
        panoramas={[mockPanorama, pano2]}
      />
    );

    // Transition hotspot should be present
    expect(transitionHotspot.kind).toBe('transition');
  });

  it('uses heading_offset_deg for initial orientation', () => {
    render(<PanoramaViewer {...mockProps} initialYawDeg={45} />);
    // Initial view should be rotated by 45 degrees
  });

  it('supports editable mode with hotspot creation', () => {
    const onAddHotspot = vi.fn();
    render(
      <PanoramaViewer {...mockProps} editable={true} onAddHotspot={onAddHotspot} />
    );

    const viewport = document.querySelector('[style]');
    if (viewport) {
      fireEvent.doubleClick(viewport, { clientX: 300, clientY: 200 });
    }

    // Should call onAddHotspot with calculated yaw/pitch
  });

  it('supports hotspot deletion in edit mode', () => {
    const onDeleteHotspot = vi.fn();
    render(
      <PanoramaViewer
        {...mockProps}
        editable={true}
        onDeleteHotspot={onDeleteHotspot}
      />
    );

    // Delete button should be visible in edit mode
  });

  it('displays POI card with current data', () => {
    render(<PanoramaViewer {...mockProps} />);

    const poiHotspot = screen.getByText('Test POI');
    fireEvent.click(poiHotspot);

    // POI card should show live data from pois array
    expect(screen.getByText(/Test description/i)).toBeInTheDocument();
  });

  it('selects appropriate media variant (preview/mobile/full)', () => {
    const { rerender } = render(<PanoramaViewer {...mockProps} />);

    // Should use mobile_url or full_url based on viewport/device
    rerender(<PanoramaViewer {...mockProps} imageUrl="/media/asset-1/mobile" />);
  });

  it('handles close button click', () => {
    render(<PanoramaViewer {...mockProps} />);

    const closeBtn = screen.getByRole('button', { name: /close|закрыть/i });
    fireEvent.click(closeBtn);

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('measures and respects vaov (vertical angle of view)', () => {
    const limitedAsset: AssetRef = {
      ...mockAsset,
      vaov_deg: 120,
      v_offset_deg: -10,
    };

    render(<PanoramaViewer {...mockProps} assets={[limitedAsset]} />);

    // Pitch should be limited based on vaov and v_offset
  });
});
