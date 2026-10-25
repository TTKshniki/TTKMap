import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modals } from './Modals';
import { spacesData } from '../data/spacesData';
import type { PublicMap } from '../../../../CONTRACTS/types';

vi.mock('../../features/panorama/pannellumLoader', () => ({
  loadPannellum: vi.fn(async () => ({
    viewer: () => ({
      destroy: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      isLoaded: () => true,
      getYaw: () => 0,
      getPitch: () => 0,
      getHfov: () => 100,
      setYaw: vi.fn(),
      setPitch: vi.fn(),
      setHfov: vi.fn(),
      setYawBounds: vi.fn(),
      setPitchBounds: vi.fn(),
      setHfovBounds: vi.fn(),
      getContainer: () => document.createElement('div'),
      addHotSpot: vi.fn(),
      removeHotSpot: vi.fn(),
      mouseEventToCoords: vi.fn(),
      lookAt: vi.fn(),
      toggleFullscreen: vi.fn(),
      resize: vi.fn(),
    }),
  })),
  resetPannellumLoaderForTests: vi.fn(),
}));

const mockPublicMap: PublicMap = {
  id: 'map-1',
  slug: 'ttkplazabusinesscenteraaaa',
  revision: 1,
  width_units: 800,
  height_units: 600,
  updated_at: '2026-10-25T10:00:00Z',
  document: {
    title: 'Бизнес-центр «ТТК Плаза»',
    description: '',
    is_published: true,
    scale_m_per_unit: 0.1,
    max_walk_gap_units: 50,
    background_asset_id: null,
    buildings: [],
    floors: [],
    shapes: [],
    nodes: [],
    edges: [],
    pois: [],
    panoramas: [
      {
        id: 'pano-lobby',
        asset_id: 'asset-lobby',
        title: 'Панорама: Central Lobby',
        x: 100,
        y: 100,
        nav_node_id: null,
        heading_offset_deg: 0,
        floor_id: null,
      },
    ],
    hotspots: [],
  },
  assets: [
    {
      id: 'asset-lobby',
      kind: 'panorama',
      source: 'upload',
      width_px: 4096,
      height_px: 2048,
      projection: 'equirectangular',
      haov_deg: 360,
      vaov_deg: 180,
      v_offset_deg: 0,
      created_at: '2026-10-25T10:00:00Z',
      preview_url: '/api/v1/media/asset-lobby/preview',
      mobile_url: '/api/v1/media/asset-lobby/mobile',
      full_url: '/api/v1/media/asset-lobby/full',
    },
  ],
};

describe('Modals panorama integration', () => {
  it('renders PanoramaViewer with backend panorama snapshot and media url when open', async () => {
    const setOpen = vi.fn();

    render(
      <Modals
        lang="ru"
        panoramaModalOpen={true}
        setPanoramaModalOpen={setOpen}
        activePanoramaPoi={spacesData.plaza.pois[0]}
        currentSpace={spacesData.plaza}
        publicMap={mockPublicMap}
        activePanoramaId="pano-lobby"
        notificationOpen={false}
        notificationText=""
      />
    );

    // Verify PanoramaViewer is opened with backend title
    expect(await screen.findByText('Панорама: Central Lobby')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Verify close button closes the modal
    const closeBtn = screen.getByLabelText('Закрыть панораму');
    fireEvent.click(closeBtn);
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
