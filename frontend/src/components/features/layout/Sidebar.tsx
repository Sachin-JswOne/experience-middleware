import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { ElementType } from 'react';
import type { INavigationMenu } from '@/configs/AppConfig';
import AppConfig from '@/configs/AppConfig';
import { tokens } from '@/styles/theme';
import JswLogo from '@/icons/JswLogo';

const iconMap: Record<string, ElementType> = {
  Dashboard: DashboardIcon,
  Settings: SettingsIcon,
  People: PeopleIcon,
  Inventory: InventoryIcon,
  Category: CategoryIcon,
  SmartToy: SmartToyIcon,
};

export const SIDEBAR_WIDTH = 240;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  isDesktop: boolean;
}

const Sidebar = ({ mobileOpen, onClose, isDesktop }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems: INavigationMenu[] = AppConfig.NAVIGATION_MENUS ?? [];

  const handleNavigate = (route: string) => {
    navigate(route);
    if (!isDesktop) {
      onClose();
    }
  };

  const content = (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: tokens.surface,
      }}
    >
      {/* Company lockup */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          height: 56,
          flexShrink: 0,
        }}
      >
        <JswLogo width={52} height={52} />
        <Box>
          <Typography
            sx={{
              fontSize: '0.875rem',
              fontWeight: tokens.weightBold,
              lineHeight: '1.25rem',
            }}
          >
            JSW One MSME
          </Typography>
          <Typography
            sx={{
              fontSize: '0.75rem',
              lineHeight: '1rem',
              color: tokens.textSubtlest,
            }}
          >
            BEFE console
          </Typography>
        </Box>
      </Box>

      <List component="nav" sx={{ px: 1, py: 1 }}>
        {menuItems.map((item) => {
          const IconComponent = iconMap[item.icon] ?? DashboardIcon;
          const isActive = location.pathname === item.route;

          return (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigate(item.route)}
                sx={{ py: 0.75, px: 1.5 }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 32,
                    color: isActive ? tokens.brand : tokens.textSubtle,
                  }}
                >
                  <IconComponent sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: isActive ? tokens.brand : tokens.textSubtle,
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={isDesktop ? 'permanent' : 'temporary'}
      open={isDesktop || mobileOpen}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: isDesktop ? SIDEBAR_WIDTH : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          borderInlineEnd: `1px solid ${tokens.border}`,
          borderRadius: 0,
          boxShadow: isDesktop ? 'none' : tokens.shadowOverlay,
        },
      }}
    >
      {content}
    </Drawer>
  );
};

export default Sidebar;
