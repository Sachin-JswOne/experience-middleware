import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';

export interface TargetConfig {
  stopOnError: boolean;
  name?: string;
  url: string;
  method: string;
  reqTransform?: string;
  timeout: {
    request: number;
    socket: number;
  };
  rank?: number;
  headersToPass: {
    source: string;
    destination: string;
  }[];
  staticHeaders?: { [key: string]: string };
  requiredParams?: string[];
  resTransform?: string;
  interceptors?: string[];
  requiredPathParams?: string[];
}

export interface BaseRouteConfig {
  path: string;
  method: string;
  routeHandler: RouteHandler;
  isCacheRequired?: boolean;
  cacheProvider?: 'AUTO' | 'VALKEY' | 'LOCAL' | 'NONE';
  cacheTTLSeconds?: number;
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
  resTransform?: string;
}
export interface ConditionalRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.CONDITIONAL;
  conditionTransform: string;
  targets: TargetConfig[];
}

export interface PassThroughRouteConfig extends BaseRouteConfig {
  routeHandler: RouteHandler.PASS_THROUGH;
  response: string;
}

export type RouteConfig = TransformRouteConfig | AggregateRouteConfig | ConditionalRouteConfig | PassThroughRouteConfig;
