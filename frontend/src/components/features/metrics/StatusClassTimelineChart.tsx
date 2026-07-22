import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import type { TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { STATUS_CLASS_COLORS, STATUS_CLASS_LABELS } from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
}

const CLASS_KEYS = ['c2xx', 'c3xx', 'c4xx', 'c5xx'] as const;

const StatusClassTimelineChart = ({ data, loading }: Props) => {
  const hasStatusData = data.some((b) => b.statusClasses);
  const chartData = data.map((b) => ({
    time: dayjs(b.bucketTs).format('HH:mm'),
    c2xx: b.statusClasses?.c2xx ?? 0,
    c3xx: b.statusClasses?.c3xx ?? 0,
    c4xx: b.statusClasses?.c4xx ?? 0,
    c5xx: b.statusClasses?.c5xx ?? 0,
  }));

  return (
    <ChartCard
      title="Responses by Status Class"
      loading={loading}
      empty={!hasStatusData || chartData.length === 0}
    >
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
          <YAxis tick={{ fontSize: 11, fill: tokens.textSubtle }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {CLASS_KEYS.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="status"
              name={STATUS_CLASS_LABELS[key]}
              stroke={STATUS_CLASS_COLORS[key]}
              fill={STATUS_CLASS_COLORS[key]}
              fillOpacity={0.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default StatusClassTimelineChart;
