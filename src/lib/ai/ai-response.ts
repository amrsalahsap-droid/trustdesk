/**
 * D10-EN-02: Normalized AI response wrapper for provider-agnostic logic.
 */
export interface AiResponse<T> {
  data: T;
  raw: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  cached?: boolean;
  timingMs?: number;
  inputChars?: number;
  outputChars?: number;
  correlationId?: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'AiError';
  }
}
