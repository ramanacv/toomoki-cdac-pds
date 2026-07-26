import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { signInAs } = vi.hoisted(() => ({ signInAs: vi.fn() }));
vi.mock('@/auth-token.js', () => ({ signInAs }));

import { RoleLoginPage, quickRoleLogins } from '@/pages/RoleLoginPage.js';

describe('quick role login', () => {
  it('lists demo modules before Keycloak personas', () => {
    render(<RoleLoginPage />);
    expect(screen.getByRole('heading', { name: 'Choose a demo module' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supply chain/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Card & eligibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FPS authentication/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trust & reconcile/i })).toBeInTheDocument();
    expect(screen.getByText(/complements SMART-PDS\/RCMS/)).toBeInTheDocument();
    expect(quickRoleLogins).toHaveLength(9);
  });

  it('reveals module personas and starts Keycloak with a module return URL', async () => {
    const user = userEvent.setup();
    render(<RoleLoginPage />);

    expect(screen.getByText(/Click a module card to reveal/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Supply chain/i }));
    expect(screen.getByRole('button', { name: /Supply chain/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personas for Supply chain' })).toBeInTheDocument();
    expect(screen.getByText('demo-fci')).toBeInTheDocument();
    expect(screen.getByText('demo-department')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue as District Supply Officer (DSO)' }));
    expect(signInAs).toHaveBeenCalledWith('demo-department', '/m/supply-chain');
  });

  it('offers a separate eligibility journey for the department persona', async () => {
    const user = userEvent.setup();
    render(<RoleLoginPage />);

    await user.click(screen.getByRole('button', { name: /Card & eligibility/i }));
    await user.click(screen.getByRole('button', { name: 'Continue as Eligibility officer (DSO)' }));
    expect(signInAs).toHaveBeenCalledWith('demo-department', '/m/eligibility');
  });

  it('lists both FPS dealer personas for Haveli and Mulshi shops', async () => {
    const user = userEvent.setup();
    render(<RoleLoginPage />);

    await user.click(screen.getByRole('button', { name: /FPS authentication/i }));
    expect(screen.getByText('demo-fps')).toBeInTheDocument();
    expect(screen.getByText('demo-fps-202')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue as FPS Dealer · Mulshi (FPS-202)' }));
    expect(signInAs).toHaveBeenCalledWith('demo-fps-202', '/m/fps');
  });
});
