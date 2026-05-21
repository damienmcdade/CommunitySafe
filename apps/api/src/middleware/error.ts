import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation_failed", issues: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "internal_error" });
}
