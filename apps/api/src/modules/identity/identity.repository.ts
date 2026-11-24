import type { Role } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  outletId: string | null;
  isActive: boolean;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: Role;
  outlet_id: string | null;
  is_active: boolean;
}

const toUser = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  passwordHash: row.password_hash,
  role: row.role,
  outletId: row.outlet_id,
  isActive: row.is_active,
});

const COLUMNS = "id, email, full_name, password_hash, role, outlet_id, is_active";

export class IdentityRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const row = await this.db.one<UserRow>(`SELECT ${COLUMNS} FROM identity.users WHERE email = $1`, [email]);
    return row && toUser(row);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const row = await this.db.one<UserRow>(`SELECT ${COLUMNS} FROM identity.users WHERE id = $1`, [id]);
    return row && toUser(row);
  }

  async insert(user: Omit<UserRecord, "id" | "isActive">): Promise<UserRecord> {
    const row = await this.db.one<UserRow>(
      `INSERT INTO identity.users (email, full_name, password_hash, role, outlet_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [user.email, user.fullName, user.passwordHash, user.role, user.outletId],
    );
    if (!row) throw new Error("INSERT ... RETURNING returned no row");
    return toUser(row);
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.db.query("UPDATE identity.users SET last_login_at = now() WHERE id = $1", [id]);
  }
}
