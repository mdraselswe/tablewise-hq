import type { SessionUser } from "@tablewise/contracts";
import {
  Boxes,
  ChefHat,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  ShoppingBasket,
  Store,
  UtensilsCrossed,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  /** Fits under an icon in the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  end?: boolean;
}

export const HQ_NAV: NavItem[] = [
  { to: "/hq", label: "Overview", short: "Overview", icon: LayoutDashboard, end: true },
  { to: "/hq/outlets", label: "Outlets", short: "Outlets", icon: Store },
  { to: "/hq/menu", label: "Master menu", short: "Menu", icon: UtensilsCrossed },
  { to: "/hq/sales", label: "Sales", short: "Sales", icon: ReceiptText },
];

export const OUTLET_NAV: NavItem[] = [
  { to: "/outlet/pos", label: "Point of sale", short: "Sell", icon: ShoppingBasket },
  { to: "/outlet/kitchen", label: "Kitchen display", short: "Kitchen", icon: ChefHat },
  { to: "/outlet/inventory", label: "Inventory", short: "Stock", icon: Boxes },
  { to: "/outlet/sales", label: "Sales history", short: "Sales", icon: ReceiptText },
];

export const navFor = (user: SessionUser) => (user.role === "HQ_ADMIN" ? HQ_NAV : OUTLET_NAV);
