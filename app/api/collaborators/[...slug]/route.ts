import { type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { getCollaboratorRoleForRepo } from "@/lib/collaborator-access";
import { hasAdminAccess } from "@/lib/admin";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Fetches collaborators for a repository.
 * 
 * GET /api/collaborators/[owner]/[repo]
 * 
 * Requires authentication. Only accessible to GitHub users (not collaborators).
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    // TODO: support for branches and account collaborators
    if (!params.slug || params.slug.length !== 2) {
      throw createHttpError("Invalid slug: owner and repo are mandatory", 400);
    }

    const owner = params.slug[0];
    const repo = params.slug[1];
    const user = sessionResult.user;

    // Verify whether user is site admin, platform admin, or GitHub write user
    let isAuthorizedAdmin = hasAdminAccess(user);
    if (!isAuthorizedAdmin) {
      try {
        const role = await getCollaboratorRoleForRepo(user, owner, repo);
        if (role === "admin") {
          isAuthorizedAdmin = true;
        }
      } catch (err) {
        console.warn("[api/collaborators] Error checking collaborator role:", err);
      }
    }

    if (!isAuthorizedAdmin && user.githubUsername) {
      try {
        await requireGithubRepoWriteAccess(user, owner, repo);
        isAuthorizedAdmin = true;
      } catch {
        isAuthorizedAdmin = false;
      }
    }

    if (!isAuthorizedAdmin) {
      throw createHttpError("Only administrators can manage collaborators.", 403);
    }

    const collaborators = await db.query.collaboratorTable.findMany({
      where: and(
        sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
        sql`lower(${collaboratorTable.repo}) = lower(${repo})`
      )
    });
    
    return Response.json({
      status: "success",
      data: collaborators,
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
};
