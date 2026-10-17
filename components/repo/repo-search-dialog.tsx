"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { requireApiSuccess } from "@/lib/api-client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, FileText, FolderOpen, Loader2 } from "lucide-react";
import type { SearchEntry } from "@/app/api/[owner]/[repo]/[branch]/search/route";

export function RepoSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { owner, repo } = useRepo();
  const { config } = useConfig();
  const branch = config?.branch || "";

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const apiUrl = open && owner && repo && branch
    ? `/api/${owner}/${repo}/${encodeURIComponent(branch)}/search`
    : null;

  const { data: entries, isLoading } = useSWR<SearchEntry[]>(
    apiUrl,
    async (url: string) => {
      const res = await fetch(url);
      const payload = await requireApiSuccess<any>(res, "Failed to load index");
      return payload.data;
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // Filter entries in-memory by search query
  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    if (!query.trim()) return entries.slice(0, 30); // Show recent 30 items initially

    const q = query.toLowerCase().trim();
    return entries
      .filter((item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
      )
      .slice(0, 50); // Limit to top 50 matches for instant render
  }, [entries, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (item: SearchEntry) => {
      onOpenChange(false);
      setQuery("");
      router.push(item.url);
    },
    [onOpenChange, router]
  );

  // Keyboard navigation (Arrow keys and Enter)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredEntries.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredEntries.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredEntries.length) % filteredEntries.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredEntries[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
      }
    },
    [filteredEntries, selectedIndex, handleSelect]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-xl overflow-hidden gap-0 border shadow-2xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground mr-2" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search posts, pages, images and subfolders..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-sm shadow-none"
          />
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground ml-2" />}
        </div>

        <div className="max-h-80 overflow-y-auto p-2 scrollbar">
          {filteredEntries.length > 0 ? (
            <div className="space-y-1">
              {filteredEntries.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="p-1 rounded bg-muted text-muted-foreground shrink-0">
                      {item.type === "media" ? (
                        <FolderOpen className="size-4 text-amber-500" />
                      ) : (
                        <FileText className="size-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                    </div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                      {item.group}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isLoading ? "Indexing repository..." : "No results found."}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-2">
            <span>Navigate <kbd className="font-mono bg-muted px-1 rounded">↑</kbd> <kbd className="font-mono bg-muted px-1 rounded">↓</kbd></span>
            <span>Open <kbd className="font-mono bg-muted px-1 rounded">↵</kbd></span>
          </div>
          <span>Close <kbd className="font-mono bg-muted px-1 rounded">esc</kbd></span>
        </div>
      </DialogContent>
    </Dialog>
  );
}