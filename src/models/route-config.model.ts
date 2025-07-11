import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';

export interface TargetConfig {
  name?: string;
  targetUrl: string;
  targetMethod: string;
  requestTransform?: string;
  timeout: {
    request: number;
    socket: number;
  };
  rank?: number;
}

export interface BaseRouteConfig {
  path: string;
  method: string;
  routeHandler: RouteHandler;
  requestTransform?: string;
  transform?: string;
}

export interface TransformRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.TRANSFORM;
  targetUrl: string;
  targetMethod: string;
  timeout: {
    request: number;
    socket: number;
  };
}

export interface AggregateRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.AGGREGATE;
  aggregationType: AggregatorType;
  aggregator?: string;
  targets: TargetConfig[];
}

export type RouteConfig = TransformRouteConfig | AggregateRouteConfig;
