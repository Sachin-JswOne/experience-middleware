import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';

/**
 * Canned response for a target, used instead of calling it while mocking is on.
 * `file` is relative to `src/assets/mocks`. A `status` of 400+ is raised as a downstream
 * failure so error paths can be exercised.
 */
export interface MockConfig {
  file: string;
  status?: number;
  delayMs?: number;
}

export interface TargetConfig {
  stopOnError: boolean;
  name?: string;
  url: string;
  method: string;
  /** Inert unless MOCK_ENABLED=true; a bare string is shorthand for `{ file }`. */
  mock?: string | MockConfig;
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

export type RouteConfig =
  | TransformRouteConfig
  | AggregateRouteConfig
  | ConditionalRouteConfig
  | PassThroughRouteConfig;
