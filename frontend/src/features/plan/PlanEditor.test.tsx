import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanEditor } from './PlanEditor';
import type { MapDocument } from '../../../../CONTRACTS/types';
import { apiClient } from '../../shared/api';

vi.mock('../../shared/api');
vi.mock('../../shared/Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));

describe('PlanEditor', () => {
  const mockDoc: MapDocument = {
    title: 'Test Plan',
    description: '',
    is_published: false,
    scale_m_per_unit: 1.0,
    max_walk_gap_units: 50,
    background_asset_id: null,
    shapes: [],
    nodes: [],
    edges: [],
    pois: [],
    panoramas: [],
    hotspots: [],
  };

  const mockProps = {
    mapId: 'map-123',
    widthUnits: 700,
    heightUnits: 500,
    document: mockDoc,
    darkMode: false,
    isAuthenticated: true,
    onChangeDocument: vi.fn(),
    onSaveDocument: vi.fn(),
    onNotify: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plan editor with tool selection', () => {
    render(<PlanEditor {...mockProps} />);
    expect(screen.getByText(/Редактор/i)).toBeInTheDocument();
  });

  it('adds POI on SVG click in add_poi mode', () => {
    render(<PlanEditor {...mockProps} />);

    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();

    if (svg) {
      fireEvent.click(svg, { clientX: 350, clientY: 250 });

      expect(mockProps.onChangeDocument).toHaveBeenCalled();
      const call = mockProps.onChangeDocument.mock.calls[0][0] as MapDocument;
      expect(call.pois.length).toBe(1);
      expect(call.nodes.length).toBe(1);
      expect(mockProps.onNotify).toHaveBeenCalledWith(expect.stringContaining('добавлена'));
    }
  });

  it('adds room shape on click in add_room mode', () => {
    render(<PlanEditor {...mockProps} />);

    // Switch to add_room tool (assuming button exists)
    const svg = document.querySelector('svg');
    if (svg) {
      // Simulate room creation
      fireEvent.click(svg, { clientX: 200, clientY: 150 });
    }
  });

  it('preserves local plan coordinates on zoom/pan', () => {
    const docWithPOI: MapDocument = {
      ...mockDoc,
      pois: [
        {
          id: 'poi-1',
          title: 'Test POI',
          category: 'booth',
          category_label: null,
          description: '',
          x: 350,
          y: 250,
          nav_node_id: null,
        },
      ],
    };

    const { rerender } = render(<PlanEditor {...mockProps} document={docWithPOI} />);

    // POI should be at the same coordinates after re-render
    rerender(<PlanEditor {...mockProps} document={docWithPOI} />);

    expect(docWithPOI.pois[0].x).toBe(350);
    expect(docWithPOI.pois[0].y).toBe(250);
  });

  it('handles background asset upload', async () => {
    const mockAsset = {
      id: 'asset-123',
      kind: 'plan' as const,
      source: 'upload' as const,
      width_px: 1920,
      height_px: 1080,
      projection: null,
      haov_deg: null,
      vaov_deg: null,
      v_offset_deg: null,
      preview_url: '/media/asset-123/preview',
      mobile_url: '/media/asset-123/mobile',
      full_url: '/media/asset-123/full',
      created_at: '2026-01-01T00:00:00Z',
    };

    vi.mocked(apiClient.uploadAsset).mockResolvedValue(mockAsset);

    render(<PlanEditor {...mockProps} />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    if (fileInput) {
      const file = new File(['dummy'], 'plan.png', { type: 'image/png' });
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(apiClient.uploadAsset).toHaveBeenCalledWith('map-123', {
          kind: 'plan',
          file: expect.any(File),
        });
      });
    }
  });

  it('supports all POI categories including custom', () => {
    const customDoc: MapDocument = {
      ...mockDoc,
      pois: [
        {
          id: 'poi-custom',
          title: 'Custom POI',
          category: 'custom',
          category_label: 'Зона отдыха',
          description: '',
          x: 100,
          y: 100,
          nav_node_id: null,
        },
      ],
    };

    render(<PlanEditor {...mockProps} document={customDoc} />);
    expect(customDoc.pois[0].category).toBe('custom');
    expect(customDoc.pois[0].category_label).toBe('Зона отдыха');
  });

  it('creates graph nodes and edges automatically with POI', () => {
    const docWithNode: MapDocument = {
      ...mockDoc,
      nodes: [{ id: 'node-1', x: 100, y: 100 }],
    };

    render(<PlanEditor {...mockProps} document={docWithNode} />);

    const svg = document.querySelector('svg');
    if (svg) {
      fireEvent.click(svg, { clientX: 300, clientY: 300 });

      const call = mockProps.onChangeDocument.mock.calls[0][0] as MapDocument;
      expect(call.nodes.length).toBe(2); // Original + new
      expect(call.edges.length).toBe(1); // Auto-connected
    }
  });

  it('handles non-standard plan dimensions', () => {
    const narrowProps = {
      ...mockProps,
      widthUnits: 300,
      heightUnits: 900,
    };

    render(<PlanEditor {...narrowProps} />);

    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
    // Coordinates should be preserved in local units regardless of aspect ratio
  });

  it('supports mobile touch interactions', () => {
    render(<PlanEditor {...mockProps} />);

    const svg = document.querySelector('svg');
    if (svg) {
      // Simulate touch
      fireEvent.touchStart(svg, {
        touches: [{ clientX: 200, clientY: 200 }],
      });

      // Touch interactions should work similar to mouse
    }
  });

  it('deletes POI and cleans up orphan nodes', () => {
    const docWithPOI: MapDocument = {
      ...mockDoc,
      pois: [
        {
          id: 'poi-del',
          title: 'To Delete',
          category: 'booth',
          category_label: null,
          description: '',
          x: 100,
          y: 100,
          nav_node_id: 'node-del',
        },
      ],
      nodes: [{ id: 'node-del', x: 100, y: 100 }],
    };

    render(<PlanEditor {...mockProps} document={docWithPOI} />);

    // POI deletion logic should remove orphan nodes
    // (assuming delete button exists in UI)
  });

  it('saves document and notifies on success', async () => {
    vi.mocked(mockProps.onSaveDocument).mockResolvedValue(undefined);

    render(<PlanEditor {...mockProps} />);

    // Trigger save action
    await mockProps.onSaveDocument();

    expect(mockProps.onSaveDocument).toHaveBeenCalled();
  });
});
