import { Autocomplete, Box, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { tokens } from '@/styles/theme';

export interface MetricsFilter {
  routes: string[];
  method: string | null;
}

export const emptyFilter: MetricsFilter = { routes: [], method: null };

interface Props {
  routeOptions: string[];
  methodOptions: string[];
  filter: MetricsFilter;
  onChange: (filter: MetricsFilter) => void;
}

const MetricsFilterBar = ({ routeOptions, methodOptions, filter, onChange }: Props) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
    <Autocomplete
      multiple
      size="small"
      options={routeOptions}
      value={filter.routes}
      onChange={(_, routes) => onChange({ ...filter, routes })}
      renderInput={(params) => <TextField {...params} label="Filter routes" placeholder="All routes" />}
      sx={{ minWidth: 280, flex: '1 1 320px', maxWidth: 480 }}
    />
    <ToggleButtonGroup
      value={filter.method}
      exclusive
      size="small"
      onChange={(_, method: string | null) => onChange({ ...filter, method })}
      aria-label="Filter by method"
    >
      {methodOptions.map((m) => (
        <ToggleButton key={m} value={m} aria-label={`Filter ${m}`}>
          {m}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
    <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
      Filters apply to route-level widgets only.
    </Typography>
  </Box>
);

export default MetricsFilterBar;
