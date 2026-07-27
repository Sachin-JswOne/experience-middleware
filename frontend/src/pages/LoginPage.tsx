import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Card, Typography } from '@mui/material';
import Login from '@/components/features/login/Login';
import AppConfig from '@/configs/AppConfig';
import { clearSession, readSession, safeRedirectPath, writeSession } from '@/utils/session';
import UserService from '@/services/UserService';
import { tokens } from '@/styles/theme';

interface LoginRouteState {
  authError?: string;
}

// A session from an incompatible app version is discarded up front, during the
// initial state computation, so the effect below never has to set state.
const staleVersionNotice = (): string | null => {
  const session = readSession();
  if (session && session.compatibleVersion !== AppConfig.COMPATIBLE_VERSION) {
    clearSession();
    return 'You were signed out — please sign in again.';
  }
  return null;
};

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as LoginRouteState | undefined)?.authError ?? staleVersionNotice(),
  );

  useEffect(() => {
    let cancelled = false;
    const target = safeRedirectPath(new URLSearchParams(location.search).get('redirectTo'));

    // Still signed in (and compatible) — skip the login screen.
    if (readSession()) {
      navigate(target, { replace: true });
      return;
    }

    // In cookie mode the credential is invisible to JS, so a live cookie with
    // no local profile (cleared storage, another tab's logout, a fresh device
    // profile) still means "signed in". Ask the server before showing the
    // login button. A 401 here is the normal signed-out answer.
    void UserService.getSession().then((result) => {
      if (cancelled || !result.data) return;
      const { profile } = result.data;
      writeSession({
        compatibleVersion: AppConfig.COMPATIBLE_VERSION,
        name: profile.name,
        email: profile.email,
        username: profile.username,
        permissions: profile.permissions,
        organizations: profile.organizations,
      });
      navigate(target, { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, location.search]);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: tokens.surface,
        px: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 48,
                height: 48,
                borderRadius: `${tokens.radiusLarge}px`,
                bgcolor: tokens.brand,
                color: tokens.textInverse,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: tokens.weightBold,
                fontSize: '1.25rem',
              }}
            >
              J1
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" component="h1">
                Sign in to JSW One
              </Typography>
              <Typography
                variant="body1"
                sx={{ color: tokens.textSubtle, mt: 0.5 }}
              >
                {AppConfig.APP_DISPLAY_NAME}
              </Typography>
            </Box>
          </Box>

          {notice && (
            <Alert
              severity="error"
              onClose={() => setNotice(null)}
              sx={{
                bgcolor: tokens.danger,
                color: tokens.textInverse,
                '& .MuiAlert-icon': { color: tokens.textInverse },
                '& .MuiAlert-action': { color: tokens.textInverse },
              }}
            >
              {notice}
            </Alert>
          )}

          <Login />

          <Typography
            variant="body2"
            sx={{ color: tokens.textSubtlest, textAlign: 'center' }}
          >
            Access is managed by your administrator.
          </Typography>
        </Box>
      </Card>
    </Box>
  );
};

export default LoginPage;
