import type { CreateOutletRequest, Outlet, UpdateOutletRequest } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { buildSet, toIso } from "@/platform/db/sql.ts";

interface OutletRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = "id, code, name, address, timezone, is_active, created_at, updated_at";

const toOutlet = (row: OutletRow): Outlet => ({
  id: row.id,
  code: row.code,
  name: row.name,
  address: row.address,
  timezone: row.timezone,
  isActive: row.is_active,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

/** Data access for the `outlets` schema. SQL lives here and nowhere else. */
export class OutletsRepository {
  constructor(private readonly db: Database) {}

  async list(onlyOutletId?: string): Promise<Outlet[]> {
    const rows = await this.db.many<OutletRow>(
      `SELECT ${COLUMNS} FROM outlets.outlets
        WHERE ($1::uuid IS NULL OR id = $1)
        ORDER BY is_active DESC, name`,
      [onlyOutletId ?? null],
    );
    return rows.map(toOutlet);
  }

  async findById(id: string): Promise<Outlet | undefined> {
    const row = await this.db.one<OutletRow>(`SELECT ${COLUMNS} FROM outlets.outlets WHERE id = $1`, [id]);
    return row && toOutlet(row);
  }

  async insert(input: CreateOutletRequest): Promise<Outlet> {
    const row = await this.db.one<OutletRow>(
      `INSERT INTO outlets.outlets (code, name, address, timezone)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.code, input.name, input.address ?? null, input.timezone],
    );
    if (!row) throw new Error("INSERT ... RETURNING returned no row");
    return toOutlet(row);
  }

  async update(id: string, patch: UpdateOutletRequest): Promise<Outlet | undefined> {
    const { clause, values } = buildSet(
      patch,
      { name: "name", address: "address", timezone: "timezone", isActive: "is_active" },
      2,
    );
    const row = await this.db.one<OutletRow>(
      `UPDATE outlets.outlets SET ${clause} WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    return row && toOutlet(row);
  }
}
