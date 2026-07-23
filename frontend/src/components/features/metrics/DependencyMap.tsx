import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { RouteDownstreamPair } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { formatNumber } from './chartShared';

interface Props {
  pairs: RouteDownstreamPair[] | undefined;
  loading: boolean;
  // Click a route node to scope the downstream tab to it.
  onSelectRoute?: (routeKey: string) => void;
}

const MAX_ROUTES = 12;
const ROW_H = 26;
const NODE_W = 210;
const GAP_W = 170;
const SVG_W = NODE_W * 2 + GAP_W;

interface Node {
  key: string;
  label: string;
  requests: number;
  errors: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
  requests: number;
  errors: number;
}

const edgeColor = (errorRate: number): string => {
  if (errorRate >= 5) return tokens.danger;
  if (errorRate >= 1) return tokens.warning;
  return tokens.brand;
};

// Route → downstream-target flow map: which routes fan out where, weighted
// by traffic, tinted by error rate. Data is the per-(route, target) pair
// counters — no extra storage.
const DependencyMap = ({ pairs, loading, onSelectRoute }: Props) => {
  const [hovered, setHovered] = useState<string | null>(null);

  const { routes, targets, edges, maxEdge } = useMemo(() => {
    const byRoute = new Map<string, { requests: number; errors: number }>();
    for (const pair of pairs ?? []) {
      const key = `${pair.method} ${pair.route}`;
      const acc = byRoute.get(key) ?? { requests: 0, errors: 0 };
      acc.requests += pair.requestCount;
      acc.errors += pair.errorCount;
      byRoute.set(key, acc);
    }
    const topRoutes = Array.from(byRoute.entries())
      .sort(([, a], [, b]) => b.requests - a.requests)
      .slice(0, MAX_ROUTES)
      .map(([key]) => key);
    const routeSet = new Set(topRoutes);

    const edgeList: Edge[] = [];
    const byTarget = new Map<string, { requests: number; errors: number }>();
    for (const pair of pairs ?? []) {
      const key = `${pair.method} ${pair.route}`;
      if (!routeSet.has(key)) continue;
      edgeList.push({
        from: key,
        to: pair.target,
        requests: pair.requestCount,
        errors: pair.errorCount,
      });
      const acc = byTarget.get(pair.target) ?? { requests: 0, errors: 0 };
      acc.requests += pair.requestCount;
      acc.errors += pair.errorCount;
      byTarget.set(pair.target, acc);
    }

    const routeNodes: Node[] = topRoutes.map((key, idx) => ({
      key,
      label: key,
      requests: byRoute.get(key)!.requests,
      errors: byRoute.get(key)!.errors,
      y: idx * ROW_H + ROW_H / 2,
    }));
    const targetNodes: Node[] = Array.from(byTarget.entries())
      .sort(([, a], [, b]) => b.requests - a.requests)
      .map(([key, acc], idx) => ({
        key,
        label: key,
        requests: acc.requests,
        errors: acc.errors,
        y: idx * ROW_H + ROW_H / 2,
      }));

    return {
      routes: routeNodes,
      targets: targetNodes,
      edges: edgeList,
      maxEdge: Math.max(1, ...edgeList.map((e) => e.requests)),
    };
  }, [pairs]);

  const height = Math.max(routes.length, targets.length) * ROW_H + 8;
  const routeY = new Map(routes.map((n) => [n.key, n.y]));
  const targetY = new Map(targets.map((n) => [n.key, n.y]));

  const isDimmed = (edge: Edge) =>
    hovered !== null && edge.from !== hovered && edge.to !== hovered;

  return (
    <ChartCard
      title="Route → Target Flow"
      loading={loading}
      empty={edges.length === 0}
      emptyMessage="No downstream calls in this window"
      height={height}
    >
      <Box sx={{ overflowX: 'auto' }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${SVG_W} ${height}`}
          preserveAspectRatio="xMidYMin meet"
          style={{ minWidth: 560, display: 'block' }}
        >
          {edges.map((edge, idx) => {
            const y1 = routeY.get(edge.from);
            const y2 = targetY.get(edge.to);
            if (y1 === undefined || y2 === undefined) return null;
            const x1 = NODE_W;
            const x2 = NODE_W + GAP_W;
            const width = Math.max(1.5, (edge.requests / maxEdge) * 10);
            const errorRate = edge.requests > 0 ? (edge.errors / edge.requests) * 100 : 0;
            return (
              <path
                key={idx}
                d={`M ${x1} ${y1} C ${x1 + GAP_W / 2} ${y1}, ${x2 - GAP_W / 2} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={edgeColor(errorRate)}
                strokeWidth={width}
                strokeOpacity={isDimmed(edge) ? 0.08 : errorRate >= 1 ? 0.7 : 0.35}
              >
                <title>{`${edge.from} → ${edge.to} · ${formatNumber(edge.requests)} calls · ${errorRate.toFixed(1)}% errors`}</title>
              </path>
            );
          })}
          {routes.map((node) => (
            <g
              key={node.key}
              transform={`translate(0, ${node.y})`}
              onMouseEnter={() => setHovered(node.key)}
              onMouseLeave={() => setHovered(null)}
              onClick={onSelectRoute ? () => onSelectRoute(node.key) : undefined}
              style={{ cursor: onSelectRoute ? 'pointer' : 'default' }}
            >
              <title>{`${node.label} · ${formatNumber(node.requests)} downstream calls`}</title>
              <circle cx={NODE_W - 6} cy={0} r={3.5} fill={edgeColor(node.requests > 0 ? (node.errors / node.requests) * 100 : 0)} />
              <text
                x={NODE_W - 14}
                y={3.5}
                textAnchor="end"
                fontSize={10.5}
                fill={hovered === node.key ? tokens.text : tokens.textSubtle}
                fontWeight={hovered === node.key ? 600 : 400}
              >
                {node.label.length > 34 ? `…${node.label.slice(-33)}` : node.label}
              </text>
            </g>
          ))}
          {targets.map((node) => (
            <g
              key={node.key}
              transform={`translate(${NODE_W + GAP_W}, ${node.y})`}
              onMouseEnter={() => setHovered(node.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${node.label} · ${formatNumber(node.requests)} calls`}</title>
              <circle cx={6} cy={0} r={3.5} fill={edgeColor(node.requests > 0 ? (node.errors / node.requests) * 100 : 0)} />
              <text
                x={14}
                y={3.5}
                fontSize={10.5}
                fill={hovered === node.key ? tokens.text : tokens.textSubtle}
                fontWeight={hovered === node.key ? 600 : 400}
              >
                {node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label}
              </text>
            </g>
          ))}
        </svg>
      </Box>
      <Typography variant="caption" sx={{ color: tokens.textSubtlest, display: 'block', mt: 0.5 }}>
        Line width = call volume · color = error rate (top {MAX_ROUTES} routes)
      </Typography>
    </ChartCard>
  );
};

export default DependencyMap;
