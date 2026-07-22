import { Card, Typography, Box } from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

const COLORS = [tokens.brand, '#357DE8', '#2898BD', '#AF59E1', '#E06C00', '#5B7F24', '#55A0F5', '#80C0FF'];

const CacheHitPieChart = ({ data, loading }: Props) => {
  const chartData = data
    .map((r) => ({
      name: `${r.method} ${r.route}`,
      cacheHits: Math.round(r.requestCount * r.cacheHitRate / 100),
      cacheHitRate: r.cacheHitRate,
    }))
    .filter((r) => r.cacheHits > 0);

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Cache Hits by Route
      </Typography>
      {loading || chartData.length === 0 ? (
        <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            {loading ? 'Loading...' : 'No cache hits yet'}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="cacheHits"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
              formatter={(value: any, _name: any, props: any) => [
                `${value} hits (${props.payload.cacheHitRate.toFixed(1)}%)`,
                'Cache Hits',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default CacheHitPieChart;
