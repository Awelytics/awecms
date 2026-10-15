// import type { User } from "@/types/user";

// type UserLike = Pick<User, "githubUsername"> | null | undefined;

// const hasGithubIdentity = (user: UserLike): boolean => Boolean(user?.githubUsername);

// const assertGithubIdentity = (
//   user: UserLike,
//   message = "Only GitHub users can perform this action.",
// ) => {
//   if (!hasGithubIdentity(user)) {
//     throw new Error(message);
//   }
// };

// export { hasGithubIdentity, assertGithubIdentity };



import type { User } from "@/types/user";

type UserLike = Pick<User, "githubUsername"> | null | undefined;

const hasGithubIdentity = (user: UserLike): boolean => Boolean(user?.githubUsername);

const assertGithubIdentity = (
  user: UserLike,
  message = "Only GitHub users can perform this action.",
) => {
  if (!hasGithubIdentity(user)) {
    throw new Error(message);
  }
};

export type PublishConfigLike = {
  enabled?: boolean;
  label?: string;
  skipCiOnSave?: boolean;
  roles?: string[];
  users?: string[];
};

/**
 * Check whether a user is authorized to trigger publish commits.
 */
export const isUserAllowedToPublish = ({
  user,
  owner,
  publishConfig,
}: {
  user?: Pick<User, "email" | "isAdmin" | "githubUsername"> | null;
  owner: string;
  publishConfig?: PublishConfigLike;
}): boolean => {
  if (!user) return false;

  const isOwner = Boolean(
    user.githubUsername && user.githubUsername.toLowerCase() === owner.toLowerCase(),
  );
  const isAdmin = Boolean(user.isAdmin || isOwner);

  // If no specific restrictions are set, restrict to admins and repo owner by default
  if (!publishConfig?.roles?.length && !publishConfig?.users?.length) {
    return isAdmin;
  }

  if (publishConfig.roles?.includes("admin") && isAdmin) {
    return true;
  }

  const userEmail = user.email?.toLowerCase();
  const githubUser = user.githubUsername?.toLowerCase();

  if (
    publishConfig.users?.some((u) => {
      const target = u.trim().toLowerCase();
      return target === userEmail || target === githubUser;
    })
  ) {
    return true;
  }

  return false;
};

export { hasGithubIdentity, assertGithubIdentity };