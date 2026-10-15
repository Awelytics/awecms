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
  user?: Pick<User, "email" | "isAdmin" | "githubUsername" | "name"> | null;
  owner: string;
  publishConfig?: PublishConfigLike;
}): boolean => {
  if (!user || !publishConfig || publishConfig.enabled === false) return false;

  const userEmail = user.email?.trim().toLowerCase();
  const userName = user.name?.trim().toLowerCase();
  const githubUser = (user.githubUsername || user.name)?.trim().toLowerCase();

  // 1. Direct match by email, username, or name
  const allowedUsers = Array.isArray(publishConfig.users)
    ? publishConfig.users.map((u) => String(u).trim().toLowerCase())
    : [];

  if (userEmail && allowedUsers.includes(userEmail)) return true;
  if (userName && allowedUsers.includes(userName)) return true;
  if (githubUser && allowedUsers.includes(githubUser)) return true;

  // 2. Wildcard role
  if (publishConfig.roles?.includes("*")) return true;

  // 3. Admin / repo owner check
  const isOwner = Boolean(githubUser && githubUser === owner.toLowerCase());
  const isAdmin = Boolean(user.isAdmin || isOwner);

  if (publishConfig.roles?.includes("admin") && isAdmin) return true;

  // 4. Default: if no users and no roles defined, allow admins/owners
  if (!publishConfig.roles?.length && !publishConfig.users?.length) {
    return isAdmin;
  }

  return false;
};

export { hasGithubIdentity, assertGithubIdentity };