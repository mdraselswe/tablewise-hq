# ADR 0006: Stateless JWT sessions in an httpOnly cookie

- Status: accepted
- Date: 2026-11-24

## Context

Two roles (HQ admin, outlet staff) need to sign in. Any API instance, and later any extracted service, must be able to authenticate a request without a shared session store. Browser sessions must be safe from script access and cross-site requests.

## Decision

- Sign an HS256 JWT with `jose` containing the user id, role, outlet and name (issuer `tablewise-api`, audience `tablewise`, configurable lifetime, default 12 hours).
- Deliver it in an httpOnly, SameSite=Lax cookie (`tw_session`, `Secure` in production) and also return it in the login response so non-browser clients can send `Authorization: Bearer`.
- Hash passwords with Node's built-in `scrypt`, storing parameters with each hash; equalise timing for unknown emails; rate-limit failed logins.
- Require `application/json` on state-changing requests with a body, which together with SameSite blocks cross-site form posts.

## Alternatives considered

- **Server-side sessions (express-session with a store).** Easy revocation, but every request needs a store lookup and every future service needs access to the store.
- **Tokens in `localStorage`.** Readable by any script on the page, so one XSS bug leaks every session.
- **Third-party identity (Auth0, Cognito).** Appropriate for production SSO, but an external dependency and account the reviewers would need; out of scope for the brief.
- **bcrypt or argon2.** Both fine; they need native modules, while `scrypt` ships with Node and is memory-hard.

## Consequences

- Stateless verification on every instance and every future service.
- Tokens cannot be revoked before expiry. The lifetime is short, and deactivated users fail at login. A production system would add a token version per user or a short-lived access token with a refresh token.
- Moving to an asymmetric key (RS256/EdDSA with JWKS) lets services verify without being able to sign; this is a configuration change in the token service.
