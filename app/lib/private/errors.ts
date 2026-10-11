export class PrivateError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export function safeError(error: unknown): PrivateError {
  if (error instanceof PrivateError) return error;
  return new PrivateError("PRIVATE_SERVICE_UNAVAILABLE", 503);
}
