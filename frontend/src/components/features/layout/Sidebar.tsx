import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Tooltip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import type { ElementType } from 'react';
import type { INavigationMenu } from '@/configs/AppConfig';
import AppConfig from '@/configs/AppConfig';

const iconMap: Record<string, ElementType> = {
  Dashboard: DashboardIcon,
  Settings: SettingsIcon,
  People: PeopleIcon,
  Inventory: InventoryIcon,
  Category: CategoryIcon,
};

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems: INavigationMenu[] = AppConfig.NAVIGATION_MENUS ?? [];

  return (
    <Box
      sx={{
        width: 80,
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bgcolor: 'grey.900',
        color: 'common.white',
        zIndex: (theme) => theme.zIndex.drawer,
        display: 'flex',
        flexDirection: 'column',
        pt: 1,
      }}
    >
      <List sx={{ py: 0 }}>
        {menuItems.map((item) => {
          const IconComponent = iconMap[item.icon] ?? DashboardIcon;
          const isActive = location.pathname === item.route;

          return (
            <ListItem key={item.id} disablePadding sx={{ display: 'block' }}>
              <Tooltip title={item.label} placement="right">
                <ListItemButton
                  onClick={() => navigate(item.route)}
                  sx={{
                    minHeight: 48,
                    justifyContent: 'center',
                    px: 2.5,
                    bgcolor: isActive ? 'primary.dark' : 'transparent',
                    '&:hover': {
                      bgcolor: isActive ? 'primary.dark' : 'action.hover',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      justifyContent: 'center',
                      color: isActive ? 'primary.light' : 'grey.400',
                    }}
                  >
                    <IconComponent />
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default Sidebar;
