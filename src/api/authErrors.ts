// Shared by the real auth client and the mock auth backend, so mock-mode error
// copy always matches what the app shows against the real backend.

// Error bodies are `{ code, message }` (see backend AUTH_STATUS_MAP). Known
// codes get fixed, tested frontend copy; anything else falls back to the
// backend's own message (e.g. field-validation text), then a generic string.
export const AUTH_ERROR_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_IN_USE: 'That email is already registered',
  RESET_TOKEN_INVALID: 'This reset link is no longer valid',
}

export async function authErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { code?: string; message?: string }
    if (body.code && AUTH_ERROR_COPY[body.code]) return AUTH_ERROR_COPY[body.code]
    return body.message || fallback
  } catch {
    return fallback
  }
}
