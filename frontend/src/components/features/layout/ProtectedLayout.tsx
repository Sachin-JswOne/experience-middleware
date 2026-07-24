import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Logout as LogoutIcon, Menu as MenuIcon } from '@mui/icons-material';
import type { ILooseObject } from '@/_types/common.interface';
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar';
import AppConfig from '@/configs/AppConfig';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';

const ProtectedLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const stored: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const hasToken = Boolean(stored?.token);
  const isOAuth2Route = location.pathname === '/oauth2';

  if (!hasToken && !isOAuth2Route) {
    return <Navigate to="/login" replace />;
  }

  const userInfo = hasToken ? stored ?? null : null;

  const handleLogout = () => {
    LocalStorage.removeItem('userInfo');
    navigate('/login', { replace: true });
  };

  const displayName = userInfo?.name || userInfo?.username || 'User';
  const initial = String(displayName).charAt(0).toUpperCase();

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar
        isDesktop={isDesktop}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar
          position="fixed"
          sx={{
            width: isDesktop ? `calc(100% - ${SIDEBAR_WIDTH}px)` : '100%',
            ml: isDesktop ? `${SIDEBAR_WIDTH}px` : 0,
          }}
        >
          <Toolbar sx={{ gap: 1 }}>
            {!isDesktop && (
              <IconButton
                aria-label="Open navigation"
                edge="start"
                onClick={() => setMobileOpen(true)}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography
              variant="h6"
              component="span"
              noWrap
              sx={{ flexGrow: 1 }}
            >
              {AppConfig.APP_DISPLAY_NAME}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: tokens.backgroundSelected,
                  color: tokens.brandHovered,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {initial}
              </Avatar>
              <Typography
                variant="body1"
                noWrap
                sx={{
                  color: tokens.textSubtle,
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                {displayName}
              </Typography>
              <Button
                variant="text"
                onClick={handleLogout}
                startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
                sx={{
                  display: { xs: 'none', sm: 'inline-flex' },
                  whiteSpace: 'nowrap',
                }}
              >
                Log out
              </Button>
              <IconButton
                aria-label="Log out"
                onClick={handleLogout}
                sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
              >
                <LogoutIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>
        <Toolbar /> {/* Spacer for fixed AppBar */}
        <Box component="main" sx={{ p: { xs: 3, md: 4 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default ProtectedLayout;
