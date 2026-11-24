import type { SessionUser } from "@tablewise/contracts";
import { LayoutDashboard, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const HQ_NAV: NavItem[] = [{ to: "/hq", label: "Overview", icon: LayoutDashboard, end: true }];

export const OUTLET_NAV: NavItem[] = [];

export const navFor = (user: SessionUser) => (user.role === "HQ_ADMIN" ? HQ_NAV : OUTLET_NAV);
