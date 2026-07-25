import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { signInAs } = vi.hoisted(() => ({ signInAs: vi.fn() }));
vi.mock('@/auth-token.js', () => ({ signInAs }));

import { RoleLoginPage, quickRoleLogins } from '@/pages/RoleLoginPage.js';

describe('quick role login', () => {
  it('lists the Keycloak demo personas without storing passwords', () => {
    render(<RoleLoginPage />);
    expect(screen.getByRole('heading', { name: 'Choose an entry journey' })).toBeInTheDocument();
    expect(screen.getByText('demo-fci')).toBeInTheDocument();
    expect(screen.getByText('demo-godown')).toBeInTheDocument();
    expect(screen.getByText('demo-department')).toBeInTheDocument();
    expect(screen.getByText('demo-block-office')).toBeInTheDocument();
    expect(screen.getByText('demo-fps')).toBeInTheDocument();
    expect(screen.getByText('demo-auditor')).toBeInTheDocument();
    expect(screen.getByText('demo-platform-admin')).toBeInTheDocument();
    expect(screen.getByText(/complements SMART-PDS\/RCMS/)).toBeInTheDocument();
    expect(quickRoleLogins).toHaveLength(7);
  });

  it('starts the real Keycloak flow with a username hint and role-specific return URL', async () => {
    const user = userEvent.setup();
    render(<RoleLoginPage />);
    await user.click(screen.getByRole('button', { name: 'Continue as District Supply Officer (DSO)' }));
    expect(signInAs).toHaveBeenCalledWith('demo-department', '/workbench');
  });
});
