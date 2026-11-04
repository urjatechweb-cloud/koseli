import "server-only";

/**
 * Auth seam. Wire this to Auth.js (NextAuth) or Clerk in the auth phase.
 * Until then it fails closed: payment routes return 501 rather than trusting
 * any client-supplied identity.
 */
export async function requireUserId(_req: Request): Promise<string> {
  throw new AuthNotConfiguredError();
}

export class AuthNotConfiguredError extends Error {
  readonly status = 501;
  constructor() {
    super("auth not configured — implement requireUserId in src/server/auth.ts");
  }
}
