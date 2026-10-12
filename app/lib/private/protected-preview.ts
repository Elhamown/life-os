import "server-only";
// The passwordless mode is restricted to the Vercel-protected branch alias.
// Custom domains are excluded because the project's Vercel SSO protection does
// not apply to them.
const protectedAlias = "life-os-git-feature-single-owner-boundaries-elhamown.vercel.app";
export function isPasswordlessProtectedPreview(host: string | null): boolean {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "feature/single-owner-boundaries" &&
    host?.toLowerCase() === protectedAlias;
}
