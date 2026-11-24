import { z } from "zod";
import type { ModuleDefinition } from "@/platform/module.ts";
import { SESSION_COOKIE } from "./middleware.ts";

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  delete json["$schema"];
  return json;
}

function parametersOf(schema: z.ZodType | undefined, location: "path" | "query" | "header"): JsonSchema[] {
  if (!schema) return [];
  const json = toJsonSchema(schema);
  const properties = (json["properties"] ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json["required"] as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    ...(typeof property["description"] === "string" ? { description: property["description"] } : {}),
    schema: property,
  }));
}

const ERROR_RESPONSES = {
  "400": {
    description: "Validation failed",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  "401": {
    description: "Not signed in",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  "403": {
    description: "Not allowed",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  "404": {
    description: "Not found",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  "409": {
    description: "Conflict (e.g. INSUFFICIENT_STOCK)",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
};

/** Generates the OpenAPI 3.1 document from the same route declarations that Express serves. */
export function buildOpenApiDocument(modules: readonly ModuleDefinition[], version: string): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const module of modules) {
    for (const route of module.routes) {
      const path = `/api/v1${route.path.replace(/:(\w+)/g, "{$1}")}`;
      const operation: JsonSchema = {
        tags: [module.name],
        summary: route.summary,
        ...(route.description ? { description: route.description } : {}),
        parameters: [
          ...parametersOf(route.schemas.params, "path"),
          ...parametersOf(route.schemas.query, "query"),
          ...parametersOf(route.schemas.headers, "header"),
        ],
        security: route.isPublic ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { [String(route.successStatus)]: { description: "Success" }, ...ERROR_RESPONSES },
        ...(route.roles ? { "x-roles": route.roles } : {}),
      };
      if (route.schemas.body) {
        operation["requestBody"] = {
          required: true,
          content: { "application/json": { schema: toJsonSchema(route.schemas.body) } },
        };
      }
      paths[path] = { ...paths[path], [route.method]: operation };
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Tablewise API",
      version,
      description:
        "Multi-outlet F&B platform: HQ master menu and pricing, outlet POS sales with atomic stock deduction, kitchen display and reporting. Money is always in minor units (poisha).",
    },
    servers: [{ url: "/" }],
    tags: modules.map((module) => ({ name: module.name, description: module.description })),
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: SESSION_COOKIE },
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
                requestId: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths,
  };
}

/** Interactive reference (Scalar) for the generated document. */
export const API_DOCS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tablewise API reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export const API_DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
].join("; ");
