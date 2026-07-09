import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StakeholdersPanel } from '../src/components/DataPanels.js';
import { stakeholders } from '@pds/fixtures';

describe('StakeholdersPanel', () => {
  it('labels active operators and passive oversight parties', () => {
    render(<StakeholdersPanel stakeholders={stakeholders} />);

    expect(screen.getByText(/workbench operators and/i)).toBeInTheDocument();
    expect(screen.getAllByText('Workbench operator').length).toBeGreaterThan(0);
    expect(screen.getByText('Transport Contractor 01').closest('article')).toHaveTextContent('View only');
    expect(screen.getByText('Auditor 01').closest('article')).toHaveTextContent('View only');
    expect(screen.getByText('FPS 101').closest('article')).toHaveTextContent('Workbench operator');
  });
});
