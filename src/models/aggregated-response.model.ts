import { CustomError } from 'src/utils/CustomError';

export interface AggregatedResponse {
  target: string;
  success: boolean;
  data?: any;
  error?: string;
  httpStatus?: number;
  downstreamResponse?: any;
  customError?: CustomError | null;
}
