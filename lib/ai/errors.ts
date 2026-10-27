export class AIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export function aiErrorResponse(error: unknown): {
  error: string;
  code: string;
  status: number;
} {
  if (error instanceof AIError)
    return { error: error.message, code: error.code, status: error.status };
  return {
    error:
      'No se pudo procesar la solicitud del asistente. Intenta nuevamente.',
    code: 'AI_INTERNAL',
    status: 500,
  };
}
