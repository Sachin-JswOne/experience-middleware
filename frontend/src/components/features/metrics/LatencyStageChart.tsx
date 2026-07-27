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
  CHART_COLORS,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  formatMs,
} from './chartShared';

interface Props {
  data: DownstreamBreakdown[];
  loading: boolean;
}

const STAGES = [
  { key: 'buildRequestMs', label: 'Build request' },
  { key: 'createClientMs', label: 'Create client' },
  { key: 'downstreamMs', label: 'Downstream call' },
  { key: 'resTransformMs', label: 'Transform response' },
] as const;

const LatencyStageChart = ({ data, loading }: Props) => {
  const withStages = data.filter((d) => d.avgStages);
  const chartData = withStages.map((d) => ({
    name: d.target,
    buildRequestMs: Math.round(d.avgStages!.buildRequestMs * 10) / 10,
    createClientMs: Math.round(d.avgStages!.createClientMs * 10) / 10,
    downstreamMs: Math.round(d.avgStages!.downstreamMs * 10) / 10,
    resTransformMs: Math.round(d.avgStages!.resTransformMs * 10) / 10,
  }));

  return (
    <ChartCard
      title="Latency by stage (avg)"
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage="No stage timings yet"
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: tokens.textSubtle }} />
          <YAxis
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            label={{
              value: 'ms',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12, fill: tokens.textSubtle },
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => [formatMs(Number(value)), name as string]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {STAGES.map((stage, idx) => (
            <Bar
              key={stage.key}
              dataKey={stage.key}
              stackId="stages"
              name={stage.label}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default LatencyStageChart;
