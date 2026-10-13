export class CliError extends Error {
  constructor(
    message: string,
    public readonly code = 2,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
