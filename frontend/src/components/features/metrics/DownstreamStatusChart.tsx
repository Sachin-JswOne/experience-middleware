import { memo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DownstreamBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, {
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  STATUS_CLASS_COLORS,
  STATUS_CLASS_LABELS,
} from './chartShared';

interface Props {
  data: DownstreamBreakdown[];
  loading: boolean;
}

const CLASS_KEYS = ['c2xx', 'c3xx', 'c4xx', 'c5xx'] as const;

const MAX_TARGETS = 10;

const DownstreamStatusChart = ({ data, loading }: Props) => {
  const hasStatusData = data.some((d) => d.statusClasses || (d.networkErrorCount ?? 0) > 0);
  const chartData = data
    .map((d) => ({
      name: d.target,
      c2xx: d.statusClasses?.c2xx ?? 0,
      c3xx: d.statusClasses?.c3xx ?? 0,
      c4xx: d.statusClasses?.c4xx ?? 0,
      c5xx: d.statusClasses?.c5xx ?? 0,
      network: d.networkErrorCount ?? 0,
    }))
    .sort(
      (a, b) =>
        b.c2xx +
        b.c3xx +
        b.c4xx +
        b.c5xx +
        b.network -
        (a.c2xx + a.c3xx + a.c4xx + a.c5xx + a.network),
    )
    .slice(0, MAX_TARGETS);

  return (
    <ChartCard
      title="Downstream responses by status"
      loading={loading}
      empty={!hasStatusData || chartData.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 44 + 60)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            width={120}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            cursor={{ fill: tokens.backgroundNeutralSubtleHovered }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {CLASS_KEYS.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="status"
              name={STATUS_CLASS_LABELS[key]}
              fill={STATUS_CLASS_COLORS[key]}
            />
          ))}
          <Bar dataKey="network" stackId="status" name="Network error" fill={tokens.textSubtlest} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default memo(DownstreamStatusChart);
