import type { Database } from "@/platform/db/database.ts";
import type { EventBus } from "@/platform/events/event-bus.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { ReportingController } from "./reporting.controller.ts";
import { ReportingRepository } from "./reporting.repository.ts";
import { reportingRoutes } from "./reporting.routes.ts";
import { ReportingService } from "./reporting.service.ts";

/**
 * Reporting is a pure read side (CQRS). It never calls another module: it builds
 * its own tables from events. Pointing it at a read replica or a warehouse, or
 * running it as a separate service, needs no change to any other module.
 */
export function createReportingModule(deps: { db: Database; bus: EventBus; businessTimeZone: string }): {
  module: ModuleDefinition;
} {
  const repository = new ReportingRepository(deps.db);
  deps.bus.subscribe("outlets.outlet.upserted", "reporting.outlets", (event) =>
    repository.upsertOutlet(event.payload),
  );
  deps.bus.subscribe("sales.sale.completed", "reporting.sales", (event) =>
    repository.applySale(event.payload),
  );

  const service = new ReportingService(repository, deps.businessTimeZone);
  return {
    module: {
      name: "Reporting",
      description: "Revenue and best-seller reports served from event-fed projections.",
      routes: reportingRoutes(new ReportingController(service)),
    },
  };
}
