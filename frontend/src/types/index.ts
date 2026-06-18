export type RouteHandler =
  | 'TRANSFORM'
  | 'AGGREGATE'
  | 'CONDITIONAL'
  | 'PASS_THROUGH';

export interface TargetConfig {
  stopOnError: boolean;
  name?: string;
  url: string;
  method: string;
  reqTransform?: string;
  timeout: { request: number; socket: number };
  rank?: number;
  headersToPass: { source: string; destination: string }[];
  staticHeaders?: Record<string, string>;
  requiredParams?: string[];
  resTransform?: string;
  interceptors?: string[];
  requiredPathParams?: string[];
}

export interface RouteConfig {
  id: string;
  path: string;
  method: string;
  routeHandler: RouteHandler;
  target?: TargetConfig;
  targets?: TargetConfig[];
  aggregator?: string;
  aggregationType?: string;
  conditionTransform?: string;
  response?: string;
  resTransform?: string;
}

export interface ConfigApiResponse extends Array<RouteConfig> {}