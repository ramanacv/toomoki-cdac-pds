import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommodityLot } from '@pds/shared-types';
import { LotStatus } from '@pds/shared-types';
import { LotsPanel } from '@/components/DataPanels.js';

const lot = (overrides: Partial<CommodityLot>): CommodityLot => ({
  lotId: 'LOT-1',
  commodity: 'Rice',
  season: 'Kharif 2026',
  quantityKg: 100,
  qualityGrade: 'A',
  source: 'PROC-001',
  currentOwner: 'PROC-001',
  currentLocation: 'PROC-001',
  status: LotStatus.CREATED,
  ...overrides
});

const lots: CommodityLot[] = [
  lot({ lotId: 'LOT-PENDING', status: LotStatus.CREATED }),
  lot({ lotId: 'LOT-DISPATCHED', status: LotStatus.DISPATCHED }),
  lot({ lotId: 'LOT-RECEIVED', status: LotStatus.RECEIVED }),
  lot({ lotId: 'LOT-SHORTAGE', status: LotStatus.RECEIVED_WITH_SHORTAGE })
];

describe('LotsPanel', () => {
  it('shows every lot by default', () => {
    render(<LotsPanel lots={lots} />);
    for (const l of lots) {
      expect(screen.getByText(l.lotId)).toBeInTheDocument();
    }
  });

  it('filters to pending lots (created + dispatched)', async () => {
    const user = userEvent.setup();
    render(<LotsPanel lots={lots} />);

    await user.click(screen.getByRole('tab', { name: /Pending/ }));

    expect(screen.getByText('LOT-PENDING')).toBeInTheDocument();
    expect(screen.getByText('LOT-DISPATCHED')).toBeInTheDocument();
    expect(screen.queryByText('LOT-RECEIVED')).not.toBeInTheDocument();
    expect(screen.queryByText('LOT-SHORTAGE')).not.toBeInTheDocument();
  });

  it('filters to received lots (received + shortage)', async () => {
    const user = userEvent.setup();
    render(<LotsPanel lots={lots} />);

    await user.click(screen.getByRole('tab', { name: /^Received/ }));

    expect(screen.getByText('LOT-RECEIVED')).toBeInTheDocument();
    expect(screen.getByText('LOT-SHORTAGE')).toBeInTheDocument();
    expect(screen.queryByText('LOT-PENDING')).not.toBeInTheDocument();
  });

  it('filters to shortage lots only', async () => {
    const user = userEvent.setup();
    render(<LotsPanel lots={lots} />);

    await user.click(screen.getByRole('tab', { name: /Shortage/ }));

    expect(screen.getByText('LOT-SHORTAGE')).toBeInTheDocument();
    expect(screen.queryByText('LOT-RECEIVED')).not.toBeInTheDocument();
  });

  it('fires onSelectLot when a row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectLot = vi.fn();
    render(<LotsPanel lots={lots} onSelectLot={onSelectLot} />);

    await user.click(screen.getByText('LOT-PENDING'));

    expect(onSelectLot).toHaveBeenCalledWith('LOT-PENDING');
  });
});
