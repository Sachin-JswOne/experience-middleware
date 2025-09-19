export class CustomError extends Error {
  public httpStatusCode: number;

  constructor(message: string, httpStatusCode: number) {
    super(message);
    this.name = 'CustomError';
    this.httpStatusCode = httpStatusCode;
  }
}
