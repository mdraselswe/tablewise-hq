import { ErrorCode, type StockShortfall, type ValidationIssue } from "@tablewise/contracts";

/**
 * An error the client can act on. Services throw these; the error middleware turns
 * them into `{ error: { code, message, details } }` with the right HTTP status.
 * Anything that is not an AppError becomes a 500 and its message is never leaked.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(issues: ValidationIssue[], message = "The request is invalid") {
    super(400, ErrorCode.VALIDATION_FAILED, message, { issues });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sign in to continue") {
    super(401, ErrorCode.UNAUTHENTICATED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, ErrorCode.NOT_FOUND, id ? `${resource} ${id} was not found` : `${resource} was not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, ErrorCode.CONFLICT, message, details);
  }
}

export class InsufficientStockError extends AppError {
  constructor(shortfalls: StockShortfall[]) {
    super(409, ErrorCode.INSUFFICIENT_STOCK, "Not enough stock to complete this request", { shortfalls });
  }
}

export class ItemsNotSellableError extends AppError {
  constructor(menuItemIds: string[]) {
    super(422, ErrorCode.ITEMS_NOT_SELLABLE, "Some items are not on this outlet's menu or are unavailable", {
      menuItemIds,
    });
  }
}

export class OutletInactiveError extends AppError {
  constructor(outletId: string) {
    super(409, ErrorCode.OUTLET_INACTIVE, "This outlet is inactive and cannot trade", { outletId });
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(409, ErrorCode.INVALID_STATE_TRANSITION, `Cannot move from ${from} to ${to}`, { from, to });
  }
}
