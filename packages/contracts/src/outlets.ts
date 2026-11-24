import { z } from "zod";

/**
 * Any IANA zone the runtime understands, aliases included. `Intl.supportedValuesOf`
 * lists canonical names only, so it would reject valid zones such as "UTC" and
 * "Asia/Kolkata" (listed as "Asia/Calcutta"); constructing a formatter accepts both.
 */
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export const TimeZone = z.string().min(1).max(64).refine(isTimeZone, "Unknown IANA time zone");

export const OutletCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,8}$/, "2 to 8 letters or digits")
  .meta({ description: "Short, immutable code. It prefixes every receipt number, e.g. GUL-000042." });

export const CreateOutletRequest = z.object({
  code: OutletCode,
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).optional(),
  timezone: TimeZone.default("Asia/Dhaka"),
});
export type CreateOutletRequest = z.infer<typeof CreateOutletRequest>;

export const UpdateOutletRequest = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(500).nullable(),
    timezone: TimeZone,
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");
export type UpdateOutletRequest = z.infer<typeof UpdateOutletRequest>;

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
