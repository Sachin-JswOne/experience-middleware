import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { CHART_COLORS, formatPercent } from './chartShared';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

interface CacheSlice {
  name: string;
  cacheHits: number;
  cacheHitRate: number;
}

interface CacheTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CacheSlice }>;
}

const CacheTooltip = ({ active, payload }: CacheTooltipProps) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      style={{
        background: tokens.backgroundNeutralBold,
        color: tokens.textInverse,
        borderRadius: tokens.radiusSmall,
        padding: '6px 12px',
        fontSize: 12,
      }}
    >
      <strong>{p.name}</strong>
      <div>
        {p.cacheHits} hits ({formatPercent(p.cacheHitRate)})
      </div>
    </div>
  );
};

const CacheHitPieChart = ({ data, loading }: Props) => {
  const chartData: CacheSlice[] = data
    .map((r) => ({
      name: `${r.method} ${r.route}`,
      cacheHits: Math.round((r.requestCount * r.cacheHitRate) / 100),
      cacheHitRate: r.cacheHitRate,
    }))
    .filter((r) => r.cacheHits > 0);

  return (
    <ChartCard
      title="Cache hits by route"
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage="No cache hits yet"
    >
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
              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CacheTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default CacheHitPieChart;
