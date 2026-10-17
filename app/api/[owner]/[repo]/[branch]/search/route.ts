import { getRepoReadContext } from "@/lib/api-repo-context";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getFileExtension, getFileName, getParentPath, normalizePath } from "@/lib/utils/file";

export interface SearchEntry {
  id: string;
  type: "content" | "media";
  title: string;
  subtitle: string;
  path: string;
  url: string;
  group: string;
}

// In-memory cache for git trees to prevent GitHub API rate limits
const treeCache: Record<string, { time: number; data: SearchEntry[] }> = {};
const CACHE_TTL = 60 * 1000; // 60 seconds

const DEFAULT_MEDIA_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "ico",
  "mp4", "webm", "mov", "pdf", "mp3", "wav"
];

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> }
) {
  try {
    const params = await context.params;
    const { token, config } = await getRepoReadContext(params);
    const { owner, repo, branch } = params;

    const cacheKey = `${owner}/${repo}/${branch}`;
    const cached = treeCache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return Response.json({ status: "success", data: cached.data });
    }

    // Fetch complete recursive file tree from GitHub in a single API call for the current branch
    const githubUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const ghResponse = await fetch(githubUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PagesCMS-GlobalSearch",
      },
    });

    if (!ghResponse.ok) {
      throw createHttpError(`Failed to fetch repository tree: ${ghResponse.statusText}`, ghResponse.status);
    }

    const payload = await ghResponse.json();
    const tree: Array<{ path: string; type: "blob" | "tree"; size?: number }> = payload.tree || [];

    const contentSchemas: any[] = (config.object as any).content || [];
    const mediaSchemas: any[] = (config.object as any).media || [];

    const entries: SearchEntry[] = [];

    for (const item of tree) {
      if (item.type !== "blob") continue;
      const normalizedItemPath = normalizePath(item.path);

      // Ignore hidden files and system directories (.gitkeep, .gitignore, .DS_Store, .github/, etc.)
      const isHidden = normalizedItemPath.split("/").some((segment) => segment.startsWith("."));
      if (isHidden) continue;

      // 1. Check if file belongs to any content collection or single file page
      let matchedContent = false;
      for (const schema of contentSchemas) {
        if (schema.type === "collection" && schema.path) {
          const collectionRoot = normalizePath(schema.path);
          if (normalizedItemPath.startsWith(collectionRoot)) {
            const fileName = getFileName(normalizedItemPath);
            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: fileName,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
              // Exact Next.js edit route: /collection/[name]/edit/[path]
              url: `/${owner}/${repo}/${encodeURIComponent(branch)}/collection/${encodeURIComponent(schema.name)}/edit/${encodeURIComponent(normalizedItemPath)}`,
              group: schema.label || schema.name || "Content",
            });
            matchedContent = true;
            break;
          }
        } else if (schema.type === "file" && schema.path) {
          if (normalizedItemPath === normalizePath(schema.path)) {
            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: schema.label || schema.name,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
              // Exact single-file route: /file/[name]
              url: `/${owner}/${repo}/${encodeURIComponent(branch)}/file/${encodeURIComponent(schema.name)}`,
              group: "Pages",
            });
            matchedContent = true;
            break;
          }
        }
      }

      if (matchedContent) continue;

      // 2. Check if file belongs to any media folder (including all subfolders)
      for (const media of mediaSchemas) {
        if (!media.input) continue;
        const mediaRoot = normalizePath(media.input);
        if (normalizedItemPath.startsWith(mediaRoot)) {
          const fileName = getFileName(normalizedItemPath);
          const extension = getFileExtension(fileName).toLowerCase();

          // Only allow real media formats (filter out non-media files)
          const allowedExtensions = media.extensions?.length
            ? media.extensions.map((ext: string) => ext.toLowerCase())
            : DEFAULT_MEDIA_EXTENSIONS;

          if (!allowedExtensions.includes(extension)) {
            continue;
          }

          const parentDir = getParentPath(normalizedItemPath) || media.input;
          const mediaName = media.name || "default";

          entries.push({
            id: normalizedItemPath,
            type: "media",
            title: fileName,
            subtitle: normalizedItemPath,
            path: normalizedItemPath,
            // Navigate directly into the parent folder of the media file
            url: `/${owner}/${repo}/${encodeURIComponent(branch)}/media/${encodeURIComponent(mediaName)}?path=${encodeURIComponent(parentDir)}`,
            group: media.label || media.name || "Media",
          });
          break;
        }
      }
    }

    treeCache[cacheKey] = {
      time: Date.now(),
      data: entries,
    };

    return Response.json({ status: "success", data: entries });
  } catch (error: any) {
    console.error("[search-api]", error);
    return toErrorResponse(error);
  }
}