import { getRepoReadContext } from "@/lib/api-repo-context";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getFileExtension, getFileName, getParentPath, normalizePath } from "@/lib/utils/file";
import { db } from "@/db";
import { cacheFileTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { parse } from "@/lib/serialization";

export interface SearchEntry {
  id: string;
  type: "content" | "media";
  title: string;
  subtitle: string;
  path: string;
  url: string;
  group: string;
  itemUrl?: string;
  description?: string;
  searchableText: string;
}

// In-memory cache for search index to prevent unnecessary database/GitHub load
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

    // 1. Fetch complete recursive file tree from GitHub for current branch
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

    // 2. Fetch all cached file contents from Neon PostgreSQL in a single fast query
    const cachedFiles = await db
      .select({
        path: cacheFileTable.path,
        content: cacheFileTable.content,
      })
      .from(cacheFileTable)
      .where(
        and(
          eq(cacheFileTable.owner, owner),
          eq(cacheFileTable.repo, repo),
          eq(cacheFileTable.branch, branch),
        )
      );

    const contentMap = new Map<string, string>();
    for (const file of cachedFiles) {
      if (file.content) {
        contentMap.set(normalizePath(file.path), file.content);
      }
    }

    const contentSchemas: any[] = (config.object as any).content || [];
    const mediaSchemas: any[] = (config.object as any).media || [];

    const entries: SearchEntry[] = [];

    for (const item of tree) {
      if (item.type !== "blob") continue;
      const normalizedItemPath = normalizePath(item.path);

      // Ignore hidden/system files and folders (.gitkeep, .github/, .DS_Store, etc.)
      const isHidden = normalizedItemPath.split("/").some((segment) => segment.startsWith("."));
      if (isHidden) continue;

      // 1. Check if file belongs to any content collection or single file page
      let matchedContent = false;
      for (const schema of contentSchemas) {
        if (schema.type === "collection" && schema.path) {
          const collectionRoot = normalizePath(schema.path);
          if (normalizedItemPath.startsWith(collectionRoot)) {
            const fileName = getFileName(normalizedItemPath);
            let displayTitle = fileName;
            let description = "";
            let itemUrl = "";
            let searchableText = `${fileName} ${normalizedItemPath}`;

            // Parse frontmatter and full content from Neon cache
            const rawContent = contentMap.get(normalizedItemPath);
            if (rawContent) {
              searchableText += ` ${rawContent}`;
              try {
                const parsed = parse(rawContent, { format: schema.format || "yaml-frontmatter" });
                if (parsed && typeof parsed === "object") {
                  if (parsed.title && typeof parsed.title === "string") {
                    displayTitle = parsed.title;
                  }
                  if (parsed.description && typeof parsed.description === "string") {
                    description = parsed.description;
                  }
                  const candidateUrl = parsed.full_url || parsed.url;
                  if (candidateUrl && typeof candidateUrl === "string") {
                    itemUrl = candidateUrl;
                  }
                }
              } catch {
                // Keep default fileName if frontmatter parse fails
              }
            }

            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: displayTitle,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
              // Exact Next.js edit route: /collection/[name]/edit/[path]
              url: `/${owner}/${repo}/${encodeURIComponent(branch)}/collection/${encodeURIComponent(schema.name)}/edit/${encodeURIComponent(normalizedItemPath)}`,
              group: schema.label || schema.name || "Content",
              description,
              itemUrl,
              searchableText,
            });
            matchedContent = true;
            break;
          }
        } else if (schema.type === "file" && schema.path) {
          if (normalizedItemPath === normalizePath(schema.path)) {
            let displayTitle = schema.label || schema.name;
            let description = "";
            let itemUrl = "";
            let searchableText = `${schema.name} ${normalizedItemPath}`;

            const rawContent = contentMap.get(normalizedItemPath);
            if (rawContent) {
              searchableText += ` ${rawContent}`;
              try {
                const parsed = parse(rawContent, { format: schema.format || "yaml-frontmatter" });
                if (parsed && typeof parsed === "object") {
                  if (parsed.title && typeof parsed.title === "string") {
                    displayTitle = parsed.title;
                  }
                  if (parsed.description && typeof parsed.description === "string") {
                    description = parsed.description;
                  }
                  const candidateUrl = parsed.full_url || parsed.url;
                  if (candidateUrl && typeof candidateUrl === "string") {
                    itemUrl = candidateUrl;
                  }
                }
              } catch {}
            }

            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: displayTitle,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
              // Exact single-file route: /file/[name]
              url: `/${owner}/${repo}/${encodeURIComponent(branch)}/file/${encodeURIComponent(schema.name)}`,
              group: "Pages",
              description,
              itemUrl,
              searchableText,
            });
            matchedContent = true;
            break;
          }
        }
      }

      if (matchedContent) continue;

      // 2. Check if file belongs to any media folder
      for (const media of mediaSchemas) {
        if (!media.input) continue;
        const mediaRoot = normalizePath(media.input);
        if (normalizedItemPath.startsWith(mediaRoot)) {
          const fileName = getFileName(normalizedItemPath);
          const extension = getFileExtension(fileName).toLowerCase();

          // Only allow real media formats
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
            url: `/${owner}/${repo}/${encodeURIComponent(branch)}/media/${encodeURIComponent(mediaName)}?path=${encodeURIComponent(parentDir)}`,
            group: media.label || media.name || "Media",
            searchableText: `${fileName} ${normalizedItemPath}`,
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