"use client";

import { useState, useEffect } from "react";
import { getRawUrl } from "@/lib/github-image";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { cn } from "@/lib/utils";
import { Ban, ImageOff, Loader } from "lucide-react";

// Generate optimized thumbnail URL using wsrv.nl CDN
function getOptimizedThumbnailUrl(url: string | null, path: string | null): string | null {
  if (!url) return null;

  // SVG files are vectors, serve them directly without resizing
  const isSvg = path?.toLowerCase().endsWith(".svg") || url.toLowerCase().includes(".svg");
  if (isSvg) return url;

  // wsrv.nl caches and resizes images to WebP via Cloudflare edge CDN
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=300&fit=cover&output=webp`;
}

export function Thumbnail({
  name,
  path,
  className,
  fit = "cover",
}: {
  name: string,
  path: string | null;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [error, setError] = useState(null);

  const { owner, repo, isPrivate } = useRepo();
  
  const { config } = useConfig();
  const branch = config?.branch!;
  
  useEffect(() => {
    const fetchRawUrl = async () => {
      if (path) {
        setError(null);
        if (!rawUrl) setRawUrl(null);
        try {
          const url = await getRawUrl(owner, repo, branch, name, path, isPrivate);
          setRawUrl(url);
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn(errorMessage);
          setError(error.message);
        }
      }
    };

    fetchRawUrl();
  }, [path, owner, repo, branch, isPrivate, name, rawUrl]);

  return (
    <div
      className={cn(
        "bg-muted w-full aspect-square overflow-hidden relative",
        className
      )}
    >
      {path
        ? rawUrl
          ? <img
              src={getOptimizedThumbnailUrl(rawUrl, path) || rawUrl}
              alt={path.split("/").pop() || "thumbnail"}
              loading="lazy"
              onError={(e) => {
                // Fallback to original raw GitHub URL if proxy fails
                const target = e.currentTarget;
                if (target.src !== rawUrl) {
                  target.src = rawUrl;
                }
              }}
              className={cn("absolute inset-0 w-full h-full select-none pointer-events-none", fit === "contain" ? "object-contain" : "object-cover")}

            />
          : error
            ? <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title={error}>
                <Ban className="h-4 w-4"/>
              </div>
            : <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="Loading...">
                <Loader className="h-4 w-4 animate-spin"/>
              </div>
        : <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="No image">
            <ImageOff className="h-4 w-4"/>
          </div>
      }
    </div>
  );
};
