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
import type { CacheProviderStats } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from './chartShared';

interface Props {
  data: CacheProviderStats[] | undefined;
  loading: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  valkey: 'Valkey',
  local: 'Local',
  none: 'No cache',
};

const CacheProviderChart = ({ data, loading }: Props) => {
  const chartData = (data ?? [])
    .filter((p) => p.hits > 0 || p.misses > 0)
    .map((p) => ({
      name: PROVIDER_LABELS[p.provider] ?? p.provider,
      hits: p.hits,
      misses: p.misses,
    }));

  return (
    <ChartCard
      title="Cache by provider"
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage="No cache activity yet"
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: tokens.textSubtle }} />
          <YAxis tick={{ fontSize: 12, fill: tokens.textSubtle }} allowDecimals={false} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="hits" name="Hits" stackId="cache" fill={tokens.success} />
          <Bar dataKey="misses" name="Misses" stackId="cache" fill={tokens.warning} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default memo(CacheProviderChart);
