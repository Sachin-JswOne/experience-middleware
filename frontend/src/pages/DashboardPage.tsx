import { useNavigate } from 'react-router-dom';
import { Box, Card, CardActionArea, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import type { ElementType } from 'react';
import type { ILooseObject } from '@/_types/common.interface';
import AppConfig from '@/configs/AppConfig';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';

// Decorative accent ramps from DESIGN.md (subtlest background + accent icon).
const moduleMeta: Record<
  string,
  { icon: ElementType; description: string; tileBg: string; tileFg: string }
> = {
  '/products': {
    icon: InventoryIcon,
    description: 'Browse and manage the product catalogue',
    tileBg: '#E9F2FE',
    tileFg: '#357DE8',
  },
  '/categories': {
    icon: CategoryIcon,
    description: 'Organise products into categories',
    tileBg: '#E7F9FF',
    tileFg: '#2898BD',
  },
  '/users': {
    icon: PeopleIcon,
    description: 'Manage user access and roles',
    tileBg: '#F8EEFE',
    tileFg: '#AF59E1',
  },
  '/settings': {
    icon: SettingsIcon,
    description: 'Configure application preferences',
    tileBg: '#F0F1F2',
    tileFg: '#7D818A',
  },
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const userInfo: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const firstName = String(userInfo?.name || '')
    .trim()
    .split(' ')[0];

  const modules = (AppConfig.NAVIGATION_MENUS ?? []).filter(
    (item) => moduleMeta[item.route]
  );

  return (
    <Box>
      <Typography variant="h3" component="h1">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Jump into a module to manage the catalogue.
      </Typography>

      <Box
        sx={{
          mt: 4,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 2,
        }}
      >
        {modules.map((item) => {
          const meta = moduleMeta[item.route];
          if (!meta) return null;
          const IconComponent = meta.icon;

          return (
            <Card key={item.id}>
              <CardActionArea
                onClick={() => navigate(item.route)}
                sx={{
                  p: 2.5,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  '&:hover': {
                    bgcolor: tokens.backgroundNeutralSubtleHovered,
                  },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: `${tokens.radiusMedium}px`,
                    bgcolor: meta.tileBg,
                    color: meta.tileFg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 1.5,
                  }}
                >
                  <IconComponent sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h5" component="h2">
                  {item.label}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ color: tokens.textSubtle, mt: 0.5 }}
                >
                  {meta.description}
                </Typography>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default DashboardPage;
