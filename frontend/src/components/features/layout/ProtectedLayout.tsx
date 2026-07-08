import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Toolbar,
  Typography,
} from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import type { ILooseObject } from '@/_types/common.interface';
import Sidebar from './Sidebar';
import AppConfig from '@/configs/AppConfig';
import LocalStorage from '@/utils/LocalStorage';

const ProtectedLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userInfo, setUserInfo] = useState<ILooseObject | null>(null);

  useEffect(() => {
    const stored: ILooseObject | undefined = LocalStorage.getItem('userInfo');
    if (stored?.token) {
      setUserInfo(stored);
    }

    const hasToken = Boolean(stored?.token);
    const isOAuth2Route = location.pathname === '/oauth2';

    if (!hasToken && !isOAuth2Route) {
      navigate('/login', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleLogout = () => {
    LocalStorage.removeItem('userInfo');
    navigate('/login', { replace: true });
  };

  const displayName = userInfo?.name || userInfo?.username || 'User';

  const SIDEBAR_WIDTH = 80;

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1, ml: `${SIDEBAR_WIDTH}px` }}>
        <AppBar
          position="fixed"
          sx={{
            width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
            ml: `${SIDEBAR_WIDTH}px`,
          }}
        >
          <Toolbar>
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
              {AppConfig.APP_DISPLAY_NAME}
            </Typography>
            <Typography variant="body2" sx={{ mr: 2 }}>
              {displayName}
            </Typography>
            <Button
              color="inherit"
              onClick={handleLogout}
              startIcon={<LogoutIcon />}
            >
              Logout
            </Button>
          </Toolbar>
        </AppBar>
        <Toolbar /> {/* Spacer for fixed AppBar */}
        <Box component="main" sx={{ p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default ProtectedLayout;
