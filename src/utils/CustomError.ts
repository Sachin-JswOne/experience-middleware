export class CustomError extends Error {
  public httpStatusCode: number;
  public downstreamResponse?: any;

  constructor(message: string, httpStatusCode: number) {
    super(message);

    this.name = 'CustomError';
    this.httpStatusCode = httpStatusCode;
    this.downstreamResponse = {
      error: message,
    };

    Object.setPrototypeOf(this, CustomError.prototype);

    Error.captureStackTrace(this, this.constructor);
  }
}

export function extractErrorMessage(error: any): string {
  const rawMessage = error?.message || '';

  // Extract JSON "message"
  const match = rawMessage.match(/"message"\s*:\s*"([^"]+)"/);

  if (match?.[1]) {
    return match[1];
  }

  return rawMessage || 'Something went wrong';
}
