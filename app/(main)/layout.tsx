import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAccounts } from "@/lib/accounts";
import { UserProvider } from "@/contexts/user-context";
import { User } from "@/types/user";
import { getServerSession } from "@/lib/session-server";
import { GithubAuthExpired } from "@/components/github-auth-expired";
import { isGithubAuthError } from "@/lib/github-auth";
import { invalidateSessionForGithubAuthError } from "@/lib/github-auth-server";
import { hasAdminAccess } from "@/lib/admin";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const session = await getServerSession();
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!session?.user) return redirect(signInUrl);

  let accounts: any[] = [];
  try {
    accounts = await getAccounts(session.user as User);
  } catch (error) {
    if (isGithubAuthError(error)) {
      await invalidateSessionForGithubAuthError(session);
      return <GithubAuthExpired />;
    }
    console.warn("[main-layout] Failed to fetch user accounts, falling back to empty list:", error);
    accounts = [];
  }

  const userWithAccounts = {
    ...session.user,
    isAdmin: hasAdminAccess(session.user as User),
    accounts,
  };
  
	return (
    <UserProvider user={userWithAccounts}>
      {children}
    </UserProvider>
  );
}
