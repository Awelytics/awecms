import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { requireApiUserSession } from "@/lib/session-server";
import { toErrorResponse } from "@/lib/api-error";

/**
 * Returns latest deployment status for a branch (Cloudflare Pages / GitHub Checks).
 * GET /api/[owner]/[repo]/[branch]/status
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo, true);
    if (!token) throw new Error("Token not found");

    const octokit = createOctokitInstance(token);

    // Fetch commit statuses and check runs in parallel
    const [statusResponse, checkRunsResponse] = await Promise.all([
      octokit.rest.repos.getCombinedStatusForRef({
        owner: params.owner,
        repo: params.repo,
        ref: params.branch,
      }),
      octokit.rest.checks.listForRef({
        owner: params.owner,
        repo: params.repo,
        ref: params.branch,
      }),
    ]);

    const combined = statusResponse.data;
    const checkRuns = checkRunsResponse.data.check_runs;

    // 1. Look for Cloudflare Pages check run
    const cloudflareCheck = checkRuns.find(
      (run) =>
        /cloudflare|pages/i.test(run.name) ||
        /cloudflare|pages/i.test(run.app?.name || "")
    ) || checkRuns[0];

    if (cloudflareCheck) {
      let state: "pending" | "success" | "failure" = "pending";
      if (cloudflareCheck.status === "completed") {
        state = cloudflareCheck.conclusion === "success" ? "success" : "failure";
      }

      return Response.json({
        state,
        context: cloudflareCheck.name,
        description: cloudflareCheck.output?.title || cloudflareCheck.conclusion || cloudflareCheck.status,
        targetUrl: cloudflareCheck.html_url || null,
        sha: cloudflareCheck.head_sha,
      });
    }

    // 2. Look for Cloudflare commit status
    const cloudflareStatus = combined.statuses.find((s) =>
      /cloudflare|pages/i.test(s.context)
    ) || combined.statuses[0];

    if (cloudflareStatus) {
      let state: "pending" | "success" | "failure" = "pending";
      if (cloudflareStatus.state === "success") state = "success";
      else if (cloudflareStatus.state === "failure" || cloudflareStatus.state === "error") state = "failure";

      return Response.json({
        state,
        context: cloudflareStatus.context,
        description: cloudflareStatus.description,
        targetUrl: cloudflareStatus.target_url,
        sha: combined.sha,
      });
    }

    if (combined.total_count > 0) {
      let state: "pending" | "success" | "failure" = "pending";
      if (combined.state === "success") state = "success";
      else if (combined.state === "failure") state = "failure";

      return Response.json({
        state,
        context: "CI",
        description: combined.state,
        targetUrl: null,
        sha: combined.sha,
      });
    }

    return Response.json({
      state: "idle",
      context: null,
      description: null,
      targetUrl: null,
      sha: null,
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}