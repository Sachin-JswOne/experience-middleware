import type { SxProps, Theme } from '@mui/material';

/** Two-column chart grid, collapsing to one column below `lg`. */
export const GRID_SX: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
  gap: 2,
};

/** Charts that need the full grid width (timelines, heatmaps). */
export const FULL_WIDTH_SX: SxProps<Theme> = { gridColumn: { xs: '1', lg: '1 / -1' } };
