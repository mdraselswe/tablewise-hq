import type { PaymentMethod, SessionUser } from "@tablewise/contracts";
import type { Container } from "@/container.ts";

/**
 * Demo data for the hosted instance and local development.
 *
 * Everything goes through the real module APIs (not raw INSERTs), so stock
 * movements, receipt numbers, kitchen tickets and report projections are exactly
 * what production code would produce. A fixed random seed makes it reproducible.
 */

export const DEMO_PASSWORD = "Tablewise#2026";
const HISTORY_DAYS = 14;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 23;
const DHAKA_OFFSET = "+06:00";

const OUTLETS = [
  { code: "GUL", name: "Gulshan", address: "Road 103, Gulshan 2, Dhaka 1212", dailySales: 30 },
  { code: "DHN", name: "Dhanmondi", address: "Road 27, Dhanmondi, Dhaka 1209", dailySales: 24 },
  { code: "UTT", name: "Uttara", address: "Sector 7, Uttara, Dhaka 1230", dailySales: 19 },
  { code: "BNN", name: "Banani", address: "Road 11, Banani, Dhaka 1213", dailySales: 15 },
] as const;

const STAFF = [
  { code: "GUL", email: "gulshan@tablewise.app", fullName: "Arif Hossain" },
  { code: "DHN", email: "dhanmondi@tablewise.app", fullName: "Sumaiya Akter" },
  { code: "UTT", email: "uttara@tablewise.app", fullName: "Tanvir Ahmed" },
  { code: "BNN", email: "banani@tablewise.app", fullName: "Farhan Kabir" },
] as const;

/** [sku, name, category, price in taka, popularity weight, description] */
const MENU: [string, string, string, number, number, string][] = [
  ["COF-ESP", "Espresso", "Coffee", 180, 4, "Double shot, house blend"],
  ["COF-AME", "Americano", "Coffee", 220, 5, "Espresso topped with hot water"],
  ["COF-CAP", "Cappuccino", "Coffee", 280, 8, "Espresso, steamed milk, deep foam"],
  ["COF-LAT", "Cafe Latte", "Coffee", 290, 10, "Espresso with silky steamed milk"],
  ["COF-MAC", "Caramel Macchiato", "Coffee", 340, 6, "Vanilla, milk, espresso, caramel drizzle"],
  ["COF-ICL", "Iced Latte", "Coffee", 320, 9, "Espresso over ice and cold milk"],
  ["COF-CBR", "Cold Brew", "Coffee", 300, 5, "Steeped for 18 hours"],
  ["TEA-MSL", "Masala Chai", "Tea", 150, 7, "Black tea, milk, warm spices"],
  ["TEA-GRN", "Green Tea", "Tea", 160, 3, "Whole-leaf sencha"],
  ["TEA-LIC", "Lemon Iced Tea", "Tea", 190, 5, "Black tea, lemon, mint"],
  ["BRG-CLS", "Classic Beef Burger", "Burgers", 450, 9, "Beef patty, cheddar, pickles, house sauce"],
  ["BRG-CHK", "Chicken Crunch Burger", "Burgers", 420, 8, "Crispy chicken thigh, slaw, chilli mayo"],
  ["BRG-BBQ", "Smoky BBQ Burger", "Burgers", 520, 6, "Beef, smoked cheese, onion rings, BBQ glaze"],
  ["BRG-VEG", "Veggie Burger", "Burgers", 380, 3, "Chickpea and herb patty, avocado"],
  ["BWL-CHK", "Spiced Chicken Rice Bowl", "Rice Bowls", 350, 7, "Fragrant rice, spiced chicken, salad"],
  ["BWL-BEF", "Beef Curry Rice Bowl", "Rice Bowls", 420, 6, "Slow-cooked beef curry, basmati rice"],
  ["BWL-TER", "Teriyaki Chicken Bowl", "Rice Bowls", 460, 5, "Glazed chicken, sesame, greens"],
  ["PAS-ALF", "Chicken Alfredo", "Pasta", 480, 6, "Fettuccine, cream, parmesan, grilled chicken"],
  ["PAS-ARB", "Penne Arrabbiata", "Pasta", 420, 4, "Tomato, garlic, chilli, basil"],
  ["PAS-LAS", "Beef Lasagna", "Pasta", 550, 4, "Layered ragu, bechamel, mozzarella"],
  ["SID-FRY", "French Fries", "Sides", 180, 9, "Skin-on, sea salt"],
  ["SID-WNG", "Chicken Wings (6 pcs)", "Sides", 380, 6, "Buffalo or honey garlic"],
  ["SID-GRB", "Garlic Bread", "Sides", 200, 4, "Toasted baguette, garlic butter"],
  ["SID-CSR", "Caesar Salad", "Sides", 360, 3, "Romaine, parmesan, croutons"],
  ["DES-BRW", "Chocolate Brownie", "Desserts", 220, 6, "Warm, with chocolate sauce"],
  ["DES-CHC", "New York Cheesecake", "Desserts", 340, 5, "Baked, berry compote"],
  ["DES-TIR", "Tiramisu", "Desserts", 360, 4, "Mascarpone, espresso, cocoa"],
  ["DRK-LIM", "Fresh Lime Soda", "Drinks", 150, 6, "Sweet or salted"],
  ["DRK-MNG", "Mango Smoothie", "Drinks", 260, 6, "Ripe mango, yoghurt"],
  ["DRK-WTR", "Mineral Water", "Drinks", 60, 5, "500 ml"],
  ["DRK-COK", "Cola", "Drinks", 90, 6, "330 ml can"],
  ["DRK-OJC", "Fresh Orange Juice", "Drinks", 240, 3, "Pressed to order"],
];

/** Which SKUs each outlet does NOT sell, and outlet price overrides (taka). */
const OUTLET_RULES: Record<string, { exclude: string[]; overrides: Record<string, number> }> = {
  GUL: { exclude: [], overrides: { "COF-LAT": 320, "COF-MAC": 370, "BRG-BBQ": 560 } },
  DHN: { exclude: ["PAS-LAS", "DRK-OJC"], overrides: { "BWL-CHK": 330 } },
  UTT: {
    exclude: ["PAS-LAS", "PAS-ARB", "TEA-GRN", "SID-CSR"],
    overrides: { "BRG-CLS": 420, "BRG-CHK": 390 },
  },
  BNN: { exclude: ["BWL-BEF", "BWL-TER", "PAS-ALF", "PAS-ARB", "PAS-LAS"], overrides: { "COF-CBR": 280 } },
};

/** Mulberry32: tiny deterministic PRNG, so every fresh demo looks the same. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const dhakaDate = (time: number): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));

const pad = (value: number): string => String(value).padStart(2, "0");

export async function seedDemoData(container: Container): Promise<boolean> {
  const { db, api, relay, logger } = container;
  const existing = await db.one<{ count: number }>("SELECT count(*)::int AS count FROM outlets.outlets");
  if ((existing?.count ?? 0) > 0) {
    logger.info("demo seed skipped: the database already has data");
    return false;
  }
  const random = createRandom(2026);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  logger.info("seeding demo data");

  // ---- People and outlets ----
  const hq = await api.identity.createUser({
    email: "hq@tablewise.app",
    fullName: "Nadia Rahman",
    password: DEMO_PASSWORD,
    role: "HQ_ADMIN",
    outletId: null,
  });

  const outletIds = new Map<string, string>();
  for (const outlet of OUTLETS) {
    const created = await api.outlets.create({
      code: outlet.code,
      name: outlet.name,
      address: outlet.address,
      timezone: "Asia/Dhaka",
    });
    outletIds.set(outlet.code, created.id);
  }

  const cashiers = new Map<string, SessionUser>();
  for (const staff of STAFF) {
    const user = await api.identity.createUser({
      email: staff.email,
      fullName: staff.fullName,
      password: DEMO_PASSWORD,
      role: "OUTLET_STAFF",
      outletId: outletIds.get(staff.code) ?? null,
    });
    cashiers.set(staff.code, user);
  }

  // ---- Master menu and assignments ----
  const items = new Map<string, { id: string; weight: number }>();
  for (const [sku, name, category, price, weight, description] of MENU) {
    const item = await api.catalog.createMenuItem({
      sku,
      name,
      category,
      description,
      basePriceMinor: price * 100,
    });
    items.set(sku, { id: item.id, weight });
  }

  const menus = new Map<string, { id: string; weight: number }[]>();
  for (const outlet of OUTLETS) {
    const rules = OUTLET_RULES[outlet.code] ?? { exclude: [], overrides: {} };
    const outletId = outletIds.get(outlet.code) ?? "";
    const sellable: { id: string; weight: number }[] = [];
    for (const [sku, item] of items) {
      if (rules.exclude.includes(sku)) continue;
      const override = rules.overrides[sku];
      await api.catalog.assign(
        outletId,
        item.id,
        {
          ...(override === undefined ? {} : { priceOverrideMinor: override * 100 }),
          openingStock: 450 + Math.floor(random() * 350),
        },
        hq,
      );
      sellable.push(item);
    }
    menus.set(outlet.code, sellable);
  }

  // ---- Sales history ----
  const now = Date.now();
  const plan: { code: string; occurredAt: string }[] = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    const date = dhakaDate(now - daysAgo * 86_400_000);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekendBoost = weekday === 5 || weekday === 6 ? 1.35 : 1; // Friday and Saturday are busier in Dhaka
    for (const outlet of OUTLETS) {
      const count = Math.round(outlet.dailySales * weekendBoost * (0.8 + random() * 0.4));
      for (let index = 0; index < count; index += 1) {
        // Two daily peaks: lunch around 13:00 and dinner around 20:00.
        const peak = random() < 0.45 ? 13 : 20;
        const hour = Math.min(CLOSE_HOUR - 1, Math.max(OPEN_HOUR, Math.round(peak + (random() - 0.5) * 6)));
        const occurredAt = `${date}T${pad(hour)}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}${DHAKA_OFFSET}`;
        // Leave the last half hour for the "live" orders below.
        if (Date.parse(occurredAt) < now - 35 * 60_000) plan.push({ code: outlet.code, occurredAt });
      }
    }
  }
  // A few orders in the last 25 minutes, so every kitchen board has live tickets.
  for (const outlet of OUTLETS) {
    for (let index = 0; index < 3; index += 1) {
      plan.push({ code: outlet.code, occurredAt: new Date(now - (25 - index * 8) * 60_000).toISOString() });
    }
  }
  plan.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const payments: PaymentMethod[] = [
    "CASH",
    "CASH",
    "CASH",
    "CARD",
    "CARD",
    "MOBILE_WALLET",
    "MOBILE_WALLET",
  ];
  let created = 0;
  for (const entry of plan) {
    const menu = menus.get(entry.code) ?? [];
    const cashier = cashiers.get(entry.code);
    if (!cashier || menu.length === 0) continue;
    const totalWeight = menu.reduce((sum, item) => sum + item.weight, 0);
    const chooseItem = (): string => {
      let roll = random() * totalWeight;
      for (const item of menu) {
        roll -= item.weight;
        if (roll <= 0) return item.id;
      }
      return menu[0]?.id ?? "";
    };
    const lineCount = 1 + Math.floor(random() * 3.4);
    const lines = Array.from({ length: lineCount }, () => ({
      menuItemId: chooseItem(),
      quantity: random() < 0.75 ? 1 : 2,
    }));
    await api.sales.createSale({
      outletId: outletIds.get(entry.code) ?? "",
      request: { lines, paymentMethod: pick(payments), occurredAt: entry.occurredAt },
      idempotencyKey: undefined,
      actor: cashier,
      trustedBackfill: true,
    });
    created += 1;
    if (created % 250 === 0) logger.info({ created, total: plan.length }, "seeding sales");
  }

  // ---- A few low-stock items, so alerts have something to show ----
  for (const [code, sku, target] of [
    ["GUL", "COF-LAT", 6],
    ["GUL", "SID-FRY", 4],
    ["DHN", "BRG-CLS", 7],
    ["UTT", "COF-ICL", 3],
    ["BNN", "DES-BRW", 5],
  ] as const) {
    const outletId = outletIds.get(code) ?? "";
    const menuItemId = items.get(sku)?.id ?? "";
    const level = await db.one<{ on_hand: number }>(
      "SELECT on_hand FROM inventory.stock_levels WHERE outlet_id = $1 AND menu_item_id = $2",
      [outletId, menuItemId],
    );
    const delta = target - (level?.on_hand ?? target);
    if (delta < 0) {
      await api.inventory.adjust(
        outletId,
        menuItemId,
        { delta, reason: "WASTE", note: "End-of-day count: spoilage" },
        cashiers.get(code) ?? hq,
      );
    }
  }

  await relay.drain();
  logger.info({ sales: created, outlets: OUTLETS.length, menuItems: MENU.length }, "demo data ready");
  return true;
}
