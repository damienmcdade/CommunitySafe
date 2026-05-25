// Runtime-agnostic HTTP error class for adapter + scoring code.
// apps/web's lib/http.ts wraps this for NextResponse; apps/api wraps it
// for Express. The class itself is portable.

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
