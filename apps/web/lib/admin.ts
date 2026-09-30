/**
 * Who may open the admin dashboard (/admin-dashboard): one person, known by
 * a verified email address or a verified GitHub login on their Clerk
 * account. Deliberately hard-coded, not an env var: widening it is a code
 * change. The check itself runs on the server (lib/server/admin.ts).
 */
export const ADMIN_EMAIL = "tombyrne788@gmail.com";
export const ADMIN_GITHUB = "tom-byrn";

/** The parts of a Clerk user the check reads. */
export interface AdminCandidate {
  emailAddresses: { emailAddress: string; verification: { status: string } | null }[];
  externalAccounts: {
    provider: string;
    username: string | null;
    verification: { status: string } | null;
  }[];
}

const verified = (v: { status: string } | null) => v?.status === "verified";

export function isAdmin(user: AdminCandidate | null | undefined): boolean {
  if (!user) return false;
  const byEmail = user.emailAddresses.some(
    (e) => verified(e.verification) && e.emailAddress.trim().toLowerCase() === ADMIN_EMAIL,
  );
  const byGitHub = user.externalAccounts.some(
    (a) =>
      verified(a.verification) &&
      /^(oauth_)?github$/.test(a.provider) &&
      a.username?.toLowerCase() === ADMIN_GITHUB,
  );
  return byEmail || byGitHub;
}
