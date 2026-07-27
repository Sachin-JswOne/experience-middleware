import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/styles/theme';
import { notifyAuthExpired, writeSession, type SessionUser } from '@/utils/session';
import ProtectedLayout from '../ProtectedLayout';

const user: SessionUser = {
  token: 'tok-123',
  compatibleVersion: '0.1.0',
  permissions: [],
  name: 'Ada Lovelace',
  email: 'ada@jsw.in',
  username: 'ada',
  organizations: [],
};

const renderAt = (path: string) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<div>dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('ProtectedLayout', () => {
  it('redirects to /login with no session', () => {
    renderAt('/');
    expect(screen.getByText('login screen')).toBeInTheDocument();
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument();
  });

  it('renders the outlet and the user chrome when signed in', () => {
    writeSession(user);
    renderAt('/');

    expect(screen.getByText('dashboard content')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('signs out and routes to /login on the log out button', async () => {
    writeSession(user);
    renderAt('/');

    // The layout renders both a desktop text button and a mobile icon button;
    // which one is visible is a CSS breakpoint jsdom doesn't evaluate.
    const [logOut] = screen.getAllByRole('button', { name: /log out/i });
    await userEvent.click(logOut!);

    expect(await screen.findByText('login screen')).toBeInTheDocument();
  });

  // The regression this guards: ApiClient used to clear storage on a 401 and
  // leave the user sitting on a dead dashboard with no redirect.
  it('routes to /login when the session expires elsewhere in the app', async () => {
    writeSession(user);
    renderAt('/');
    expect(screen.getByText('dashboard content')).toBeInTheDocument();

    notifyAuthExpired();

    expect(await screen.findByText('login screen')).toBeInTheDocument();
  });
});
