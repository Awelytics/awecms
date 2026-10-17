import { getRepoReadContext } from "@/lib/api-repo-context";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getFileExtension, getFileName, getParentPath, normalizePath } from "@/lib/utils/file";
import { db } from "@/db";
import { cacheFileTable } from "@/db/schema";
import { and, sql } from "drizzle-orm";
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

// In-memory cache for search index (60s TTL)
const treeCache: Record<string, { time: number; data: SearchEntry[] }> = {};
const CACHE_TTL = 60 * 1000;

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

    const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}/${branch.toLowerCase()}`;
    const cached = treeCache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return Response.json({ status: "success", data: cached.data });
    }

    // 1. Fetch complete recursive file tree from GitHub
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

    // 2. Fetch cached file contents using case-insensitive SQL matching (LOWER)
    const cachedFiles = await db
      .select({
        path: cacheFileTable.path,
        content: cacheFileTable.content,
      })
      .from(cacheFileTable)
      .where(
        and(
          sql`lower(${cacheFileTable.owner}) = lower(${owner})`,
          sql`lower(${cacheFileTable.repo}) = lower(${repo})`,
          sql`lower(${cacheFileTable.branch}) = lower(${branch})`,
        )
      );

    const contentMap = new Map<string, string>();
    for (const file of cachedFiles) {
      if (file.content) {
        const cleanPath = normalizePath(file.path).replace(/^\/+|\/+$/g, "");
        contentMap.set(cleanPath, file.content);
      }
    }

    const contentSchemas: any[] = (config.object as any).content || [];
    const mediaSchemas: any[] = (config.object as any).media || [];

    const entries: SearchEntry[] = [];

    for (const item of tree) {
      if (item.type !== "blob") continue;
      const normalizedItemPath = normalizePath(item.path).replace(/^\/+|\/+$/g, "");

      // Ignore hidden/system files and folders (.gitkeep, .github/, .DS_Store, etc.)
      const isHidden = normalizedItemPath.split("/").some((segment) => segment.startsWith("."));
      if (isHidden) continue;

      // 1. Check if file belongs to any content collection or single file page
      let matchedContent = false;
      for (const schema of contentSchemas) {
        if (schema.type === "collection" && schema.path) {
          const collectionRoot = normalizePath(schema.path).replace(/^\/+|\/+$/g, "");
          if (normalizedItemPath.startsWith(collectionRoot)) {
            const fileName = getFileName(normalizedItemPath);
            let displayTitle = fileName;
            let description = "";
            let itemUrl = "";

            // Searchable index contains ONLY metadata: title, path, fileName, url, description
            // Heavy markdown body text is strictly excluded to prevent 4.5MB Vercel payload crashes
            const rawContent = contentMap.get(normalizedItemPath);
            if (rawContent) {
              try {
                const parsed = parse(rawContent, { format: schema.format || "yaml-frontmatter" });
                if (parsed && typeof parsed === "object") {
                  if (parsed.title && typeof parsed.title === "string") {
                    displayTitle = parsed.title;
                  }
                  if (parsed.description && typeof parsed.description === "string") {
                    description = parsed.description.slice(0, 200); // Limit description to 200 chars
                  }
                  const candidateUrl = parsed.full_url || parsed.url;
                  if (candidateUrl && typeof candidateUrl === "string") {
                    itemUrl = candidateUrl;
                  }
                }
              } catch {}
            }

            const searchableText = `${fileName} ${normalizedItemPath} ${displayTitle} ${description} ${itemUrl}`;

            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: displayTitle,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
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
          const fileRoot = normalizePath(schema.path).replace(/^\/+|\/+$/g, "");
          if (normalizedItemPath === fileRoot) {
            let displayTitle = schema.label || schema.name;
            let description = "";
            let itemUrl = "";

            const rawContent = contentMap.get(normalizedItemPath);
            if (rawContent) {
              try {
                const parsed = parse(rawContent, { format: schema.format || "yaml-frontmatter" });
                if (parsed && typeof parsed === "object") {
                  if (parsed.title && typeof parsed.title === "string") {
                    displayTitle = parsed.title;
                  }
                  if (parsed.description && typeof parsed.description === "string") {
                    description = parsed.description.slice(0, 200);
                  }
                  const candidateUrl = parsed.full_url || parsed.url;
                  if (candidateUrl && typeof candidateUrl === "string") {
                    itemUrl = candidateUrl;
                  }
                }
              } catch {}
            }

            const searchableText = `${schema.name} ${normalizedItemPath} ${displayTitle} ${description} ${itemUrl}`;

            entries.push({
              id: normalizedItemPath,
              type: "content",
              title: displayTitle,
              subtitle: normalizedItemPath,
              path: normalizedItemPath,
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
        const mediaRoot = normalizePath(media.input).replace(/^\/+|\/+$/g, "");
        if (normalizedItemPath.startsWith(mediaRoot)) {
          const fileName = getFileName(normalizedItemPath);
          const extension = getFileExtension(fileName).toLowerCase();

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