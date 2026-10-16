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
  role,
}: {
  user?: Pick<User, "email" | "isAdmin" | "githubUsername" | "name"> | null;
  owner: string;
  publishConfig?: PublishConfigLike;
  role?: "admin" | "editor" | null;
}): boolean => {
  if (!user) return false;
  // If publishing is explicitly turned off in settings
  if (publishConfig && publishConfig.enabled === false) return false;

  // If a role is explicitly defined, both editor and admin can publish
  if (role === "admin" || role === "editor") return true;

  // Check explicit user whitelist if configured in .pages.yml
  if (publishConfig?.users && publishConfig.users.length > 0) {
    const userEmail = user.email?.trim().toLowerCase();
    const userName = user.name?.trim().toLowerCase();
    const githubUser = (user.githubUsername || user.name)?.trim().toLowerCase();
    const allowedUsers = publishConfig.users.map((u) => String(u).trim().toLowerCase());
    return Boolean(
      (userEmail && allowedUsers.includes(userEmail)) ||
      (userName && allowedUsers.includes(userName)) ||
      (githubUser && allowedUsers.includes(githubUser))
    );
  }

  // By default, allow publishing for all authenticated repository users
  return true;
};

export { hasGithubIdentity, assertGithubIdentity };