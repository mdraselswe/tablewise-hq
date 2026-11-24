import { z } from "zod";

export const Role = z.enum(["HQ_ADMIN", "OUTLET_STAFF"]);
export type Role = z.infer<typeof Role>;

export const LoginRequest = z.object({
  email: z.email().max(255).trim().toLowerCase(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
}

export interface LoginResponse {
  user: SessionUser;
  /** Also set as an httpOnly cookie. Returned for API clients that prefer a Bearer header. */
  accessToken: string;
  expiresAt: string;
}
