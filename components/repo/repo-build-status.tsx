"use client";

import useSWR from "swr";
import { Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type BuildStatusData = {
  state: "pending" | "success" | "failure" | "idle";
  context?: string | null;
  description?: string | null;
  targetUrl?: string | null;
  sha?: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RepoBuildStatus({
  owner,
  repo,
  branch,
  siteUrl,
}: {
  owner: string;
  repo: string;
  branch: string;
  siteUrl?: string;
}) {
  const apiUrl = `/api/${owner}/${repo}/${encodeURIComponent(branch)}/status`;

  const { data } = useSWR<BuildStatusData>(apiUrl, fetcher, {
    refreshInterval: (latestData) => {
      // Poll rapidly (every 3 seconds) while building, otherwise slow down to 25 seconds
      return latestData?.state === "pending" ? 3000 : 25000;
    },
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  if (!data || data.state === "idle") {
    if (!siteUrl) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <Badge variant="outline" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
              Live
              <ExternalLink className="size-3" />
            </Badge>
          </a>
        </TooltipTrigger>
        <TooltipContent>Open live site</TooltipContent>
      </Tooltip>
    );
  }

  if (data.state === "pending") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1.5 text-xs animate-pulse cursor-default"
          >
            <Loader2 className="size-3 animate-spin" />
            Building...
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {data.description || "Cloudflare deployment in progress..."}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (data.state === "failure") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400 gap-1.5 text-xs cursor-default"
          >
            <AlertCircle className="size-3" />
            Build Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {data.description || "Cloudflare build failed"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Success / Live state
  const destinationUrl = siteUrl || data.targetUrl;
  const badgeContent = (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5 text-xs font-medium cursor-pointer hover:bg-emerald-500/20 transition-colors"
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Live
      {destinationUrl && <ExternalLink className="size-3 opacity-70" />}
    </Badge>
  );

  if (destinationUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            {badgeContent}
          </a>
        </TooltipTrigger>
        <TooltipContent>Open live site</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badgeContent}</TooltipTrigger>
      <TooltipContent>Site deployed successfully</TooltipContent>
    </Tooltip>
  );
}