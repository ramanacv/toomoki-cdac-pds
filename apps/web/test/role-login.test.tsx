import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { signInAs } = vi.hoisted(() => ({ signInAs: vi.fn() }));
vi.mock('@/auth-token.js', () => ({ signInAs }));

import { RoleLoginPage, quickRoleLogins } from '@/pages/RoleLoginPage.js';

describe('quick role login', () => {
  it('lists the Keycloak demo personas without storing passwords', () => {
    render(<RoleLoginPage />);
    expect(screen.getByRole('heading', { name: 'Quick role login' })).toBeInTheDocument();
    expect(screen.getByText('demo-management')).toBeInTheDocument();
    expect(screen.getByText('demo-platform-admin')).toBeInTheDocument();
    expect(quickRoleLogins).toHaveLength(8);
  });

  it('starts the real Keycloak flow with a username hint and role-specific return URL', async () => {
    const user = userEvent.setup();
    render(<RoleLoginPage />);
    await user.click(screen.getByRole('button', { name: 'Continue as Department' }));
    expect(signInAs).toHaveBeenCalledWith('demo-department', '/workbench');
  });
});
