import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConfig } from "@/lib/config-store";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoLayout } from "@/components/repo/repo-layout";
import { getServerSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { getRepoSnapshot } from "@/lib/github-cache-file";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; branch: string; }>;
}) {
  const { owner, repo, branch } = await params;
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

const decodedBranch = decodeURIComponent(branch);
  const isProtectedBranch =
    decodedBranch.toLowerCase() === "main" || decodedBranch.toLowerCase() === "master";

  if (isProtectedBranch) {
    let hasWriteAccess = false;
    if (user.githubUsername) {
      try {
        await requireGithubRepoWriteAccess(user, owner, repo);
        hasWriteAccess = true;
      } catch {
        hasWriteAccess = false;
      }
    }

    if (!hasWriteAccess) {
      // Find a real existing non-protected branch (prefer draft -> staging -> other)
      try {
        const { token: fallbackToken } = await getToken(user, owner, repo);
        if (fallbackToken) {
          const snapshot = await getRepoSnapshot(owner, repo, fallbackToken);
          const nonProtected = (snapshot.branches ?? []).filter((b) => {
            const lower = b.toLowerCase();
            return lower !== "main" && lower !== "master";
          });

          if (nonProtected.length > 0) {
            const targetBranch =
              nonProtected.find((b) => b.toLowerCase() === "draft") ||
              nonProtected.find((b) => b.toLowerCase() === "staging") ||
              nonProtected[0];

            return redirect(`/${owner}/${repo}/${encodeURIComponent(targetBranch)}`);
          }
        }
      } catch (err) {
        console.warn("[branch-layout] Failed to resolve fallback branch:", err);
      }

      // If no valid non-protected branches exist yet, redirect to repository root
      return redirect(`/${owner}/${repo}`);
    }
  }

  let config = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch: decodedBranch,
    sha: "",
    version: "",
    object: {}
  }
  
  let errorMessage = null;

  try {
    const { token } = await getToken(user, owner, repo);
    const syncedConfig = await getConfig(
      owner,
      repo,
      decodedBranch,
      {
        getToken: async () => token,
      },
    );

    if (syncedConfig) {
      config = syncedConfig;
    }
  } catch (error: any) {
    if (error.status === 404) {
      if (error.response?.data?.message === "Not Found") {
        // Let downstream pages (especially /configuration via Entry) handle missing .pages.yml.
      } else {
        // We assume the branch is not valid
        errorMessage = (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>Branch not found</EmptyTitle>
              <EmptyDescription>{`The branch "${decodedBranch}" could not be found. It may have been removed or renamed.`}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default" })} href={`/${owner}/${repo}`}>
                Open default branch
              </Link>
            </EmptyContent>
          </Empty>
        );
      }
    } else if (error.status === 403) {
      errorMessage = (
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
    } else {
      throw error;
    }
  }

  return (
    <ConfigProvider value={config}>
      <RepoLayout>{errorMessage ? errorMessage : children}</RepoLayout>
    </ConfigProvider>
  );
}
