import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getToken } from "@/lib/token";
import { RepoProvider } from "@/contexts/repo-context";
import { getServerSession } from "@/lib/session-server";
import { getRepoSnapshot } from "@/lib/github-cache-file";
import { hasAdminAccess } from "@/lib/admin";
import { getCollaboratorRoleForRepo } from "@/lib/collaborator-access";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { GithubAuthExpired } from "@/components/github-auth-expired";
import { isGithubAuthError } from "@/lib/github-auth";
import { invalidateSessionForGithubAuthError } from "@/lib/github-auth-server";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function Layout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; }>;
}) {
  const { owner, repo } = await params;
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

  try {
    const { token } = await getToken(user, owner, repo);
    if (!token) throw new Error("Token not found");

    const repoInfo = await getRepoSnapshot(owner, repo, token);
    const branchNames = repoInfo.branches ?? [];
    
    if (branchNames.length === 0) {
      return(
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Empty repository</EmptyTitle>
            <EmptyDescription>Create a branch and add a &quot;.pages.yml&quot; file to configure this repository.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default" })} href="/">
              Choose another repository
            </Link>
          </EmptyContent>
        </Empty>
      );
    }

    // Check whether the user has GitHub repo write/push access
    let hasGithubWriteAccess = false;
    if (user.githubUsername) {
      try {
        await requireGithubRepoWriteAccess(user, owner, repo);
        hasGithubWriteAccess = true;
      } catch {
        hasGithubWriteAccess = false;
      }
    }

    // Determine the current user's role for this repository safely
    let currentUserRole: "admin" | "editor" = "editor";
    try {
      const isSuperAdmin = hasAdminAccess(user);
      const isRepoOwner = Boolean(
        user.githubUsername && user.githubUsername.toLowerCase() === owner.toLowerCase()
      );

      if (isSuperAdmin || isRepoOwner) {
        currentUserRole = "admin";
      } else {
        const dbRole = await getCollaboratorRoleForRepo(user, owner, repo);
        if (dbRole) {
          currentUserRole = dbRole;
        } else if (user.githubUsername && hasGithubWriteAccess) {
          currentUserRole = "admin";
        }
      }
    } catch (roleError) {
      console.warn("[repo-layout] Failed to determine collaborator role, falling back to editor:", roleError);
    }

    // Filter out protected branches (main/master) for users without GitHub write access
    const isProtectedBranch = (branchName: string) => {
      const lower = branchName.toLowerCase();
      return lower === "main" || lower === "master";
    };

    const allowedBranches = hasGithubWriteAccess
      ? branchNames
      : branchNames.filter((branchName) => !isProtectedBranch(branchName));

    let safeDefaultBranch = repoInfo.defaultBranch;
    if (!hasGithubWriteAccess && safeDefaultBranch && isProtectedBranch(safeDefaultBranch)) {
      safeDefaultBranch =
        allowedBranches[0] ||
        "draft";
    }

    return (
      <RepoProvider
        repo={{
          ...repoInfo,
          branches: allowedBranches,
          defaultBranch: safeDefaultBranch,
          currentUserRole,
          hasGithubWriteAccess,
        }}
      >
        {children}
      </RepoProvider>
    );
  } catch (error: any) {
    console.error("[repo-layout error]", error);

    if (isGithubAuthError(error)) {
      await invalidateSessionForGithubAuthError(session);
      return <GithubAuthExpired />;
    }

    const statusCode = error?.status || error?.statusCode;
    if (statusCode === 404) {
      return (
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Repository not found</EmptyTitle>
            <EmptyDescription>It may have been removed, renamed, or the URL may be incorrect.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default" })} href="/">
              Choose another repository
            </Link>
          </EmptyContent>
        </Empty>
      );
    }

    if (statusCode === 403) {
      return (
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Access denied</EmptyTitle>
            <EmptyDescription>You do not have permission to access this repository.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default" })} href="/">
              Choose another repository
            </Link>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Failed to load repository</EmptyTitle>
          <EmptyDescription>{error?.message || "An unexpected error occurred while loading this repository."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link className={buttonVariants({ variant: "default" })} href="/">
            Back to projects
          </Link>
        </EmptyContent>
      </Empty>
    );
  }
}
