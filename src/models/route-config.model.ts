import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';

export interface TargetConfig {
  name?: string;
  url: string;
  method: string;
  reqTransform?: string;
  timeout: {
    request: number;
    socket: number;
  };
  rank?: number;
  headersToPass: string[];
}

export interface BaseRouteConfig {
  path: string;
  method: string;
  routeHandler: RouteHandler;
  resTransform?: string;
}

export interface TransformRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.TRANSFORM;
  target: TargetConfig;
}

export interface AggregateRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.AGGREGATE;
  aggregationType: AggregatorType;
  aggregator?: string;
  targets: TargetConfig[];
}

export type RouteConfig = TransformRouteConfig | AggregateRouteConfig;
