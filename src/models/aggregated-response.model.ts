export interface AggregatedResponse {
  target: string;
  success: boolean;
  data?: any;
  error?: string;
  httpStatus?: number;
  downstreamResponse?: any;
}
