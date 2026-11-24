import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Container } from "@/container.ts";
import { apiNotFound, errorHandler } from "@/platform/http/error-handler.ts";
import { authenticate, requestId, requireJsonForWrites } from "@/platform/http/middleware.ts";
import { API_DOCS_CSP, API_DOCS_HTML, buildOpenApiDocument } from "@/platform/http/openapi.ts";
import { mountRoutes } from "@/platform/http/route.ts";

const API_VERSION = "1.0.0";

export function createApp(container: Container): Express {
  const { env, logger } = container;
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url?.startsWith("/health") === true },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
        },
      },
    }),
  );
  // Never compress the SSE stream: compression buffers, which would delay live events.
  app.use(
    compression({ filter: (req, res) => !req.path.endsWith("/stream") && compression.filter(req, res) }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(container.tokens));

  // ---- Health (for load balancers and orchestrators) ----
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await container.db.ping();
      res.json({ status: "ok", database: "up", realtimeClients: container.realtime.connectedClients });
    } catch {
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  // ---- API v1 ----
  const api = express.Router();
  api.use(requireJsonForWrites);
  for (const module of container.modules) mountRoutes(api, module.routes);
  api.get("/stream", container.realtime.stream);
  app.use("/api/v1", api);

  const openApi = buildOpenApiDocument(container.modules, API_VERSION);
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openApi);
  });
  app.get("/api/docs", (_req, res) => {
    res.setHeader("Content-Security-Policy", API_DOCS_CSP);
    res.type("html").send(API_DOCS_HTML);
  });
  app.use("/api", apiNotFound);

  // ---- Web app (single-container deploy) ----
  if (env.WEB_DIST_DIR) {
    const root = path.resolve(env.WEB_DIST_DIR);
    app.use(
      express.static(root, {
        index: false,
        setHeaders: (res, filePath) => {
          // Vite fingerprints everything in /assets, so it can be cached forever.
          const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
          res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    // Client-side routing: every other GET returns the app shell.
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/health")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(root, "index.html"));
    });
  }

  app.use(errorHandler(logger));
  return app;
}
