import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Collapse,
  Drawer,
  IconButton,
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
import AssistantIcon from '@mui/icons-material/Assistant';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useState, type ElementType } from 'react';
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
  SmartToy: AssistantIcon,
};

export const SIDEBAR_WIDTH = 240;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  isDesktop: boolean;
}

const isRouteActive = (item: INavigationMenu, pathname: string): boolean => {
  if (item.route === pathname) return true;
  if (item.applicableRoutes?.includes(pathname)) return true;
  if (item.children?.some((child) => isRouteActive(child, pathname))) return true;
  return false;
};

const Sidebar = ({ mobileOpen, onClose, isDesktop }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems: INavigationMenu[] = AppConfig.NAVIGATION_MENUS ?? [];

  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    menuItems.forEach((item) => {
      if (item.children && item.children.length > 0 && isRouteActive(item, location.pathname)) {
        initial[item.id] = true;
      }
    });
    return initial;
  });

  const handleNavigate = (route: string) => {
    navigate(route);
    if (!isDesktop) {
      onClose();
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderMenuItem = (item: INavigationMenu, nested = false) => {
    const IconComponent = iconMap[item.icon] ?? DashboardIcon;
    const isActive = isRouteActive(item, location.pathname);
    const children = item.children;
    const hasChildren = children && children.length > 0;
    const isExpanded = expanded[item.id] ?? false;

    return (
      <ListItem
        key={item.id}
        disablePadding
        sx={{ mb: 0.5, flexDirection: 'column', alignItems: 'stretch' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
          <ListItemButton
            selected={isActive}
            onClick={() => handleNavigate(item.route)}
            sx={{
              flexGrow: 1,
              py: 0.75,
              px: 1.5,
              pl: nested ? 3 : 1.5,
            }}
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
          {hasChildren && (
            <IconButton
              aria-label={isExpanded ? 'Collapse menu' : 'Expand menu'}
              onClick={() => toggleExpand(item.id)}
              sx={{
                borderRadius: 1,
                color: isActive ? tokens.brand : tokens.textSubtle,
                mx: 0.5,
              }}
            >
              {isExpanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          )}
        </Box>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit sx={{ width: '100%' }}>
            <List component="div" disablePadding>
              {children.map((child) => renderMenuItem(child, true))}
            </List>
          </Collapse>
        )}
      </ListItem>
    );
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
        {menuItems.map((item) => renderMenuItem(item))}
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
