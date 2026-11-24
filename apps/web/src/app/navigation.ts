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
  icon: LucideIcon;
  end?: boolean;
}

export const HQ_NAV: NavItem[] = [
  { to: "/hq", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/hq/outlets", label: "Outlets", icon: Store },
  { to: "/hq/menu", label: "Master menu", icon: UtensilsCrossed },
  { to: "/hq/sales", label: "Sales", icon: ReceiptText },
];

export const OUTLET_NAV: NavItem[] = [
  { to: "/outlet/pos", label: "Point of sale", icon: ShoppingBasket },
  { to: "/outlet/kitchen", label: "Kitchen display", icon: ChefHat },
  { to: "/outlet/inventory", label: "Inventory", icon: Boxes },
  { to: "/outlet/sales", label: "Sales history", icon: ReceiptText },
];

export const navFor = (user: SessionUser) => (user.role === "HQ_ADMIN" ? HQ_NAV : OUTLET_NAV);
