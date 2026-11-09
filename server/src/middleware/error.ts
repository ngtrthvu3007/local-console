import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR } from "../constants.ts";

const VALIDATION_ERROR_CODE = "ValidationError";
const INTERNAL_ERROR_CODE = "InternalError";

// Lỗi có mã HTTP và mã lỗi riêng, trả nguyên cho trình duyệt
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Mọi lỗi thành JSON { code, message }
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    response
      .status(HTTP_BAD_REQUEST)
      .json({ code: VALIDATION_ERROR_CODE, message: z.prettifyError(error) });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  response
    .status(HTTP_INTERNAL_ERROR)
    .json({ code: INTERNAL_ERROR_CODE, message: (error as Error).message });
};
