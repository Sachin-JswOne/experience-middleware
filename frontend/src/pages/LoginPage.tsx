import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ILooseObject } from '@/_types/common.interface';
import Login from '@/components/features/login/Login';
import LocalStorage from '@/utils/LocalStorage';
import AppConfig from '@/configs/AppConfig';

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
        bgcolor: 'grey.100',
      }}
    >
      <Card sx={{ maxWidth: 420, width: '100%', mx: 2 }}>
        <CardContent
          sx={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            py: 4,
          }}
        >
          <Box>
            <Typography variant="h5" fontWeight="bold" color="primary">
              JSW One
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Experience Middleware
            </Typography>
          </Box>
          <Typography variant="body1" color="text.secondary">
            Please sign-in to your account
          </Typography>
          <Login />
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
