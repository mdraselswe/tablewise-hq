import type { ErrorRequestHandler, RequestHandler } from "express";
import { type ApiErrorBody, ErrorCode } from "@tablewise/contracts";
import { isPgError, PgErrorCode } from "@/platform/db/database.ts";
import type { Logger } from "@/platform/logger.ts";
import { AppError } from "./errors.ts";

/**
 * Friendly messages for constraint violations that can reach the database. The
 * constraint names come from the migrations, so every one is stable and explicit.
 */
const CONSTRAINT_MESSAGES: Record<string, { status: number; message: string }> = {
  outlets_code_key: { status: 409, message: "An outlet with this code already exists" },
  menu_items_sku_key: { status: 409, message: "A menu item with this SKU already exists" },
  users_email_key: { status: 409, message: "A user with this email already exists" },
  outlet_menu_items_outlet_fkey: { status: 404, message: "Outlet was not found" },
  outlet_menu_items_menu_item_fkey: { status: 409, message: "This menu item is still assigned or sold" },
  stock_levels_assignment_fkey: { status: 404, message: "This item is not assigned to the outlet" },
  stock_levels_on_hand_non_negative_chk: { status: 409, message: "Stock cannot go below zero" },
  sales_outlet_fkey: { status: 404, message: "Outlet was not found" },
};

function translate(error: unknown): { status: number; body: ApiErrorBody["error"] } | null {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  if (isPgError(error)) {
    const known = error.constraint ? CONSTRAINT_MESSAGES[error.constraint] : undefined;
    if (known) {
      const code = known.status === 404 ? ErrorCode.NOT_FOUND : ErrorCode.CONFLICT;
      return { status: known.status, body: { code, message: known.message } };
    }
    switch (error.code) {
      case PgErrorCode.UNIQUE_VIOLATION:
        return { status: 409, body: { code: ErrorCode.CONFLICT, message: "This record already exists" } };
      case PgErrorCode.FOREIGN_KEY_VIOLATION:
        return {
          status: 409,
          body: { code: ErrorCode.CONFLICT, message: "A related record is missing or still in use" },
        };
      case PgErrorCode.CHECK_VIOLATION:
        return {
          status: 409,
          body: { code: ErrorCode.CONFLICT, message: "The change breaks a business rule" },
        };
      case PgErrorCode.INVALID_TEXT_REPRESENTATION:
        return { status: 400, body: { code: ErrorCode.VALIDATION_FAILED, message: "Malformed value" } };
      default:
        return null;
    }
  }

  // body-parser errors carry `type` and `status`.
  if (typeof error === "object" && error !== null && "type" in error) {
    const type = (error as { type: unknown }).type;
    if (type === "entity.parse.failed") {
      return { status: 400, body: { code: ErrorCode.VALIDATION_FAILED, message: "Malformed JSON body" } };
    }
    if (type === "entity.too.large") {
      return {
        status: 413,
        body: { code: ErrorCode.VALIDATION_FAILED, message: "Request body is too large" },
      };
    }
  }
  return null;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const known = translate(error);
    if (known) {
      if (known.status >= 500) logger.error({ err: error, requestId: String(req.id) }, "request failed");
      res
        .status(known.status)
        .json({ error: { ...known.body, requestId: String(req.id) } } satisfies ApiErrorBody);
      return;
    }
    logger.error({ err: error, requestId: String(req.id), path: req.path }, "unhandled error");
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL,
        message: "Something went wrong on our side",
        requestId: String(req.id),
      },
    } satisfies ApiErrorBody);
  };
}

export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: `No route for ${req.method} ${req.originalUrl}` },
  } satisfies ApiErrorBody);
};
