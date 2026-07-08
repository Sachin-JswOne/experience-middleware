import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, Typography } from '@mui/material';
import type { ILooseObject } from '@/_types/common.interface';
import Login from '@/components/features/login/Login';
import LocalStorage from '@/utils/LocalStorage';
import AppConfig from '@/configs/AppConfig';
import { tokens } from '@/styles/theme';

const LoginPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const userInfo: ILooseObject | undefined =
      LocalStorage.getItem('userInfo');

    if (userInfo?.token) {
      if (userInfo.compatibleVersion !== AppConfig.COMPATIBLE_VERSION) {
        LocalStorage.removeItem('userInfo');
        return;
      }
      navigate('/', { replace: true });
    }
  }, [navigate]);

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
