import type { RouteDefinition } from "@/platform/http/route.ts";

/**
 * A business module (bounded context).
 *
 * Rules that keep every module extractable into its own service:
 *  1. It owns one PostgreSQL schema. Only its repository queries those tables.
 *  2. Other modules reach it only through the `api` object its factory returns
 *     (synchronous calls) or through integration events (asynchronous).
 *  3. Its routes are self-contained and mounted under /api/v1.
 * ESLint blocks deep imports into another module's files.
 */
export interface ModuleDefinition {
  name: string;
  description: string;
  routes: RouteDefinition[];
}
