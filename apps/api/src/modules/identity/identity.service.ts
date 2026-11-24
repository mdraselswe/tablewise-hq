import type { LoginRequest, Role, SessionUser } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { hashPassword, verifyPassword } from "@/platform/auth/password.ts";
import type { IssuedToken, TokenService } from "@/platform/auth/token-service.ts";
import { NotFoundError, UnauthenticatedError } from "@/platform/http/errors.ts";
import type { IdentityRepository, UserRecord } from "./identity.repository.ts";

const toSessionUser = (user: UserRecord): SessionUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  outletId: user.outletId,
});

export class IdentityService {
  /** Hash of a random password, verified when the email is unknown so both paths take equal time. */
  readonly #dummyHash = hashPassword(crypto.randomUUID());

  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: TokenService,
  ) {}

  async login(input: LoginRequest): Promise<{ user: SessionUser; session: IssuedToken }> {
    const user = await this.repository.findByEmail(input.email);
    const valid = await verifyPassword(input.password, user?.passwordHash ?? (await this.#dummyHash));
    // One message for every failure: never reveal whether the email exists.
    if (!user || !valid || !user.isActive) throw new UnauthenticatedError("Email or password is incorrect");

    await this.repository.touchLastLogin(user.id);
    const session = await this.tokens.issue(toSessionUser(user));
    return { user: toSessionUser(user), session };
  }

  async me(actor: Actor): Promise<SessionUser> {
    const user = await this.repository.findById(actor.id);
    if (!user?.isActive) throw new NotFoundError("User");
    return toSessionUser(user);
  }

  /** Used by the seeder and future user-management screens. */
  async createUser(input: {
    email: string;
    fullName: string;
    password: string;
    role: Role;
    outletId: string | null;
  }): Promise<SessionUser> {
    const user = await this.repository.insert({
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      outletId: input.outletId,
    });
    return toSessionUser(user);
  }
}
