"use client";

import { Fragment, memo, type ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { RepoActionButtons } from "@/components/repo/repo-action-buttons";
import {
  extensionCategories,
  getFileSize,
  getParentPath,
  getFileName,
  getRelativePath,
  joinPathSegments,
  normalizePath
} from "@/lib/utils/file";
import { FolderCreate} from "@/components/folder-create";
import { FileOptions } from "@/components/file/file-options";
import { useOptionalRepoHeader } from "@/components/repo/repo-header-context";
import { MediaUpload} from "./media-upload";
import { Thumbnail } from "@/components/thumbnail";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { requireApiSuccess } from "@/lib/api-client";
import { getSchemaActions } from "@/lib/actions";
import type { FileSaveData, MediaItem } from "@/types/api";
import useSWR, { useSWRConfig } from "swr";
import {
  CornerLeftUp,
  House,
  Ban,
  Check,
  EllipsisVertical,  
  File,
  Folder,
  FolderPlus,
  Upload,
  Search,
  Copy,
  ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

function MediaHeaderActions({
  actionNode,
  mediaName,
  path,
  onFolderCreate,
}: {
  actionNode?: ReactNode;
  mediaName: string;
  path: string;
  onFolderCreate: (entry: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-x-2 shrink-0">
      {actionNode}
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <FolderCreate path={path} name={mediaName} type="media" onCreate={onFolderCreate}>
              <Button type="button" variant="outline" size="icon">
                <FolderPlus />
              </Button>
            </FolderCreate>
          </div>
        </TooltipTrigger>
        <TooltipContent>Create folder</TooltipContent>
      </Tooltip>
      <MediaUpload.Trigger>
        <Button type="button" className="gap-2">
          <Upload />
          Upload
        </Button>
      </MediaUpload.Trigger>
    </div>
  );
}

type MediaFolderTileProps = {
  item: MediaItem;
  onNavigate: (path: string) => void;
};

const MediaFolderTile = memo(function MediaFolderTile({ item, onNavigate }: MediaFolderTileProps) {
  return (
    <button
      className="hover:bg-muted focus:ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 outline-none rounded-md block w-full"
      onClick={() => onNavigate(item.path)}
    >
      <div className="flex items-center justify-center aspect-video">
        <Folder className="stroke-[0.5] h-[5.5rem] w-[5.5rem]"/>
      </div>
      <div className="flex items-center justify-center p-2">
        <div className="overflow-hidden h-9">
          <div className="text-sm font-medium truncate">{item.name}</div>
        </div>
      </div>
    </button>
  );
});

type MediaFileTileProps = {
  item: MediaItem;
  mediaName: string;
  selectable: boolean;
  isSelected: boolean;
  isImage: boolean;
  displaySize: string;
  portalContainer: HTMLDivElement | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newPath: string) => void;
  onViewDetails?: (item: MediaItem) => void;
};

const MediaFileTile = memo(function MediaFileTile({
  item,
  mediaName,
  selectable,
  isSelected,
  isImage,
  displaySize,
  portalContainer,
  onSelect,
  onDelete,
  onRename,
  onViewDetails,
}: MediaFileTileProps) {
  const content = (
    <div className={cn(
      "relative rounded-md group",
      selectable && "hover:bg-muted peer-focus:ring-offset-background peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-checked:ring-offset-background peer-checked:ring-offset-2 peer-checked:ring-2 peer-checked:ring-ring",
    )}>
      <div 
        className={cn("cursor-pointer", !selectable && "hover:opacity-90 transition-opacity")}
        onClick={() => !selectable && onViewDetails?.(item)}
      >
        {isImage
          ? <Thumbnail name={mediaName} path={item.path} className="rounded-t-md aspect-video"/>
          : <div className="flex items-center justify-center rounded-md aspect-video bg-muted">
              <File className="stroke-[0.5] h-24 w-24"/>
            </div>
        }
      </div>
      <div className="flex gap-x-2 items-center pt-2">
        <div className="overflow-hidden mr-auto h-9">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground truncate">{displaySize}</div>
        </div>
        <FileOptions
          path={item.path}
          sha={item.sha || ""}
          type="media"
          name={mediaName}
          onDelete={onDelete}
          onRename={onRename}
          portalProps={{ container: portalContainer }}
        >
          <Button variant="ghost" size="icon-xs" className="shrink-0 self-start">
            <EllipsisVertical />
          </Button>
        </FileOptions>
      </div>
      {selectable && isSelected && (
        <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 left-2">
          <Check className="stroke-[3] w-3 h-3"/>
        </div>
      )}
    </div>
  );

  if (!selectable) return content;

  return (
    <label>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={isSelected}
        onChange={() => onSelect(item.path)}
      />
      {content}
    </label>
  );
});

const MediaView = ({
  media,
  initialPath,
  initialSelected,
  maxSelected,
  onSelect,
  onUpload,
  extensions,
  usePageHeader = true,
}: {
  media: string,
  initialPath?: string,
  initialSelected?: string[],
  maxSelected?: number,
  onSelect?: (newSelected: string[]) => void,
  onUpload?: (entry: FileSaveData) => void,
  extensions?: string[],
  usePageHeader?: boolean,
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  const { mutate } = useSWRConfig();

  const mediaConfig = useMemo(() => {
    if (!media) return config.object.media[0];
    return config.object.media.find((item: { name: string }) => item.name === media);
  }, [media, config.object.media]);

  const pathname = usePathname();
  const router = useRouter();

  const filteredExtensions = useMemo(() => {
    if (!mediaConfig?.extensions && !extensions) return [];
    
    const allowedExtensions = extensions 
      ? mediaConfig?.extensions
        ? extensions.filter(ext => mediaConfig.extensions.includes(ext))
        : extensions
      : mediaConfig.extensions;

    return allowedExtensions || [];
  }, [extensions, mediaConfig?.extensions]);
  const mediaActions = useMemo(
    () => getSchemaActions(mediaConfig),
    [mediaConfig],
  );

  const filteredExtensionsSet = useMemo(
    () => new Set((filteredExtensions || []).map((ext: string) => ext.toLowerCase())),
    [filteredExtensions],
  );

  const imageExtensionsSet = useMemo(
    () => new Set(extensionCategories.image),
    [],
  );

  const filesGridRef = useRef<HTMLDivElement | null>(null);

  const [error, setError] = useState<string | null | undefined>(null);
  const [selected, setSelected] = useState(initialSelected || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  useEffect(() => {
    setSelected(initialSelected || []);
  }, [initialSelected]);

  const [path, setPath] = useState(() => {
    if (!mediaConfig) return "";
    if (!initialPath) return mediaConfig.input;
    const normalizedInitialPath = normalizePath(initialPath);
    if (normalizedInitialPath.startsWith(mediaConfig.input)) return normalizedInitialPath;
    console.warn(`"${initialPath}" is not within media root "${mediaConfig.input}". Defaulting to media root.`);
    return mediaConfig.input;
  });
  const [data, setData] = useState<MediaItem[] | undefined>(undefined);
  
  // Filter the data based on filteredExtensions when displaying
  const filteredData = useMemo(() => {
    if (!data) return undefined;
    let list = data;

    if (filteredExtensionsSet.size > 0) {
      list = list.filter(item => 
        item.type === "dir" ||
        filteredExtensionsSet.has(item.extension?.toLowerCase())
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }

    return list;
  }, [data, filteredExtensionsSet, searchQuery]);

  const sortMediaItems = useCallback((items: MediaItem[]) => {
    return [...items].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
  }, []);
  
  const buildMediaApiUrl = useCallback((targetPath: string): string => (
    `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${encodeURIComponent(mediaConfig.name)}/${encodeURIComponent(targetPath)}`
  ), [config.branch, config.owner, config.repo, mediaConfig.name]);

  const mediaKey = useMemo(() => buildMediaApiUrl(path), [buildMediaApiUrl, path]);
  const fetchMediaByUrl = useCallback(async (apiUrl: string): Promise<MediaItem[]> => {
    const response = await fetch(apiUrl);
    const payload = await requireApiSuccess<any>(
      response,
      "Failed to fetch media",
    );
    return payload.data as MediaItem[];
  }, []);

  const {
    data: swrMediaData,
    error: swrMediaError,
    isLoading: swrMediaLoading,
  } = useSWR<MediaItem[]>(
    mediaKey,
    fetchMediaByUrl,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  useEffect(() => {
    if (!swrMediaData) return;
    setData(swrMediaData);
    setError(null);
  }, [swrMediaData]);

  useEffect(() => {
    if (!swrMediaError) return;
    const message = swrMediaError instanceof Error ? swrMediaError.message : "Failed to fetch media.";
    setError(message);
  }, [swrMediaError]);

  const isLoading = swrMediaLoading && !data;

  const handleUpload = useCallback((entry: FileSaveData) => {
    if (!entry.path || !entry.name) return;
    const mediaEntry: MediaItem = {
      type: "file",
      sha: entry.sha,
      name: entry.name,
      path: entry.path,
      extension: entry.extension,
      size: entry.size,
      url: entry.url,
    };

    setData((prevData) => {
      if (!prevData) return [mediaEntry];

        const existingIndex = prevData.findIndex((item) => item.path === mediaEntry.path);
        if (existingIndex >= 0) {
          const next = [...prevData];
          next[existingIndex] = { ...next[existingIndex], ...mediaEntry };
          return sortMediaItems(next);
        }

        return sortMediaItems([...prevData, mediaEntry]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
    onUpload?.(entry);
  }, [mediaConfig.name, mutate, onUpload, sortMediaItems]);

  const handleDelete = useCallback((deletedPath: string) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      const next = prevData.filter((item) => item.path !== deletedPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate]);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    setData((prevData) => {
      if (!prevData || oldPath === newPath) return prevData;

      if (getParentPath(normalizePath(oldPath)) === getParentPath(normalizePath(newPath))) {
        let changed = false;
        const next = prevData.map((item) => {
          if (item.path !== oldPath) return item;
          changed = true;
          return { ...item, path: newPath, name: getFileName(newPath) };
        });
        return changed ? sortMediaItems(next) : prevData;
      }

      const next = prevData.filter((item) => item.path !== oldPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

  const handleFolderCreate = useCallback((entry: unknown) => {
    const createdPath = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && "path" in entry
        ? (entry as { path?: string }).path
        : undefined;

    if (!createdPath) return;

    const parentPath = getParentPath(createdPath);
    if (!parentPath) return;

    const parent: MediaItem = {
      type: "dir",
      name: getFileName(parentPath),
      path: parentPath,
      size: 0,
      url: null,
    };
    
    setData((prevData) => {
      if (!prevData) return [parent];
      if (prevData.some((item) => item.path === parent.path && item.type === "dir")) {
        return prevData;
      }
      return sortMediaItems([...prevData, parent]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

  const handleNavigate = useCallback((newPath: string) => {
    setPath(newPath);
    setSearchQuery("");
    if (!onSelect) {
      const params = new URLSearchParams(window.location.search);
      params.set("path", newPath || mediaConfig.input);
      router.push(`${pathname}?${params.toString()}`);
    }
  }, [mediaConfig.input, onSelect, pathname, router]);

  const handleNavigateParent = () => {
    if (!path || path === mediaConfig.input) return;
    handleNavigate(getParentPath(path));
  }

  const handleSelect = useCallback((path: string) => {
    startTransition(() => {
      setSelected((prevSelected) => {
        const isSelected = prevSelected.includes(path);
        if (isSelected) {
          return prevSelected.filter((item) => item !== path);
        }

        const nextSelected = [...prevSelected, path];
        if (maxSelected == null) return nextSelected;
        if (maxSelected <= 0) return [];
        if (nextSelected.length <= maxSelected) return nextSelected;

        return nextSelected.slice(nextSelected.length - maxSelected);
      });
    });
  }, [maxSelected]);

  useEffect(() => {
    if (onSelect) onSelect(selected);
  }, [selected, onSelect]);

  const loadingSkeleton = useMemo(() => (
    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
      <li>
        <div className="flex items-center justify-center aspect-video text-muted">
          <Folder className="stroke-[0.5] h-[5.5rem] w-[5.5rem] animate-pulse"/>
        </div>
        <div className="flex items-center justify-center p-2">
          <div className="overflow-hidden h-9">
            <Skeleton className="w-24 h-5 rounded mb-2"/>
          </div>
        </div>
      </li>
      {[...Array(3)].map((_, index) => (
        <li key={index}>
          <Skeleton className="rounded-t-md rounded-b-none aspect-video" />
          <div className="flex items-center gap-x-2 p-2">
            <div className="overflow-hidden h-9">
              <Skeleton className="w-24 h-5 rounded mb-2"/>
              <Skeleton className="w-16 h-2 rounded"/>
            </div>
            <Button variant="ghost" size="icon-xs" className="shrink-0 ml-auto" disabled>
              <EllipsisVertical />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  ), []);

  const breadcrumbNode = useMemo(() => {
    const breadcrumbTextClass = usePageHeader ? "font-semibold text-lg flex-nowrap" : "text-sm flex-nowrap";
    const isDialog = !usePageHeader;
    const mediaTitle = mediaConfig.label || mediaConfig.name || "Media";
    const rootPath = normalizePath(mediaConfig.input);
    const currentPath = normalizePath(path || mediaConfig.input);
    const relativePath = getRelativePath(currentPath, rootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    if (isDialog && segments.length === 0) return null;

    const entries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([rootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const middleEntries = entries.length > 3 ? entries.slice(1, -1) : [];
    const visibleEntries = entries.length > 3
      ? [entries[0], entries[entries.length - 1]]
      : entries;

    return (
      <Breadcrumb>
        <BreadcrumbList className={breadcrumbTextClass}>
          <BreadcrumbItem className={entries.length === 0 ? "min-w-0 max-w-full truncate" : undefined}>
            {entries.length > 0 ? (
              <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(rootPath)}>
                {isDialog ? (
                  <>
                    <House className="size-3.5" />
                    <span className="sr-only">{mediaTitle}</span>
                  </>
                ) : (
                  mediaTitle
                )}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className={usePageHeader ? "block max-w-full font-semibold truncate" : "block max-w-full truncate"}>{mediaTitle}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {entries.length > 0 && <BreadcrumbSeparator />}

          {entries.length > 3 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                    <span className="sr-only">Show hidden segments</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleEntries.map((entry) => (
                      <DropdownMenuItem
                        key={entry.path}
                        className="cursor-pointer"
                        onClick={() => handleNavigate(entry.path)}
                      >
                        {entry.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}

          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;
            return (
              <Fragment key={entry.path}>
                <BreadcrumbItem className={isLast ? "min-w-0 max-w-full truncate" : undefined}>
                  {isLast ? (
                    <BreadcrumbPage className={usePageHeader ? "block max-w-full font-semibold truncate" : "block max-w-full truncate"}>{entry.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(entry.path)}>
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }, [handleNavigate, mediaConfig.input, mediaConfig.label, mediaConfig.name, path, usePageHeader]);

  const headerNode = useMemo(() => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
      <div className="min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
      <div className="flex items-center gap-2">
        <div className="relative w-48 sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search in folder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
          <MediaHeaderActions
            actionNode={mediaActions.length > 0 ? (
              <RepoActionButtons
                actions={mediaActions}
                owner={config.owner}
                repo={config.repo}
                refName={config.branch}
                contextType="media"
                contextName={mediaConfig.name}
                contextPath={path}
                contextData={{
                  label: mediaConfig.label || mediaConfig.name,
                  input: mediaConfig.input,
                  output: mediaConfig.output,
                }}
              />
            ) : undefined}
            mediaName={mediaConfig.name}
            path={path}
            onFolderCreate={handleFolderCreate}
          />
        </MediaUpload>
      </div>
    </div>
  ), [breadcrumbNode, config.branch, config.owner, config.repo, filteredExtensions, handleFolderCreate, handleUpload, mediaActions, mediaConfig.input, mediaConfig.label, mediaConfig.name, mediaConfig.output, path, searchQuery]);

  useOptionalRepoHeader(
    { header: headerNode },
    { enabled: usePageHeader },
  );

  const selectedPaths = useMemo(() => new Set(selected), [selected]);

  const gridItems = useMemo(() => {
    if (!filteredData) return [];

    return filteredData.map((item) => ({
      item,
      isImage: item.type === "file" && imageExtensionsSet.has((item.extension || "").toLowerCase()),
      displaySize: item.type === "file" && typeof item.size === "number" ? getFileSize(item.size) : "",
    }));
  }, [filteredData, imageExtensionsSet]);

  if (!mediaConfig.input) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Media not configured</EmptyTitle>
          <EmptyDescription>No media folder is configured for this repository.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            className={buttonVariants({ variant: "default" })}
            href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/configuration`}
          >
            Open configuration
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (error) {
    // TODO: should we use a custom error class with code?
    if (error === "Not found") {
      const isRootFolder = path === mediaConfig.input;
      return (
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Media folder not found</EmptyTitle>
            <EmptyDescription>
              {isRootFolder
                ? `The media folder "${mediaConfig.input}" does not exist yet.`
                : `The folder "${path}" could not be found.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    } else {
      return (
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Something went wrong</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => handleNavigate(mediaConfig.input)}>Open media root</Button>
          </EmptyContent>
        </Empty>
      );
    }
  }

  const mediaGrid = (
    <MediaUpload.DropZone className="flex-1 overflow-auto scrollbar">
      <div className="h-full relative flex flex-col" ref={filesGridRef}>
        {isLoading
          ? loadingSkeleton
          : gridItems.length > 0
            ? <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 p-1">
                {gridItems.map(({ item, isImage, displaySize }) => 
                  <li key={item.path}>
                    {item.type === "dir"
                      ? <MediaFolderTile item={item} onNavigate={handleNavigate} />
                      : <MediaFileTile
                          item={item}
                          mediaName={mediaConfig.name}
                          selectable={!!onSelect}
                          isSelected={selectedPaths.has(item.path)}
                          isImage={isImage}
                          displaySize={displaySize}
                          portalContainer={filesGridRef.current}
                          onSelect={handleSelect}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          onViewDetails={(item) => setDetailItem(item)}
                        />
                    }
                    
                  </li>
                )}
              </ul>
            : <Empty className="border-0 shadow-none">
                <EmptyHeader>
                  <EmptyTitle>Empty folder</EmptyTitle>
                  <EmptyDescription>Drag and drop files here, or use Upload to add files to this folder.</EmptyDescription>
                </EmptyHeader>
              </Empty>
        }
      </div>
    </MediaUpload.DropZone>
  );

  const detailDialog = detailItem ? (
    <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{detailItem.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md overflow-hidden bg-muted flex items-center justify-center min-h-48 max-h-[50vh] relative">
            {imageExtensionsSet.has((detailItem.extension || "").toLowerCase()) ? (
              <Thumbnail
                name={mediaConfig.name}
                path={detailItem.path}
                fit="contain"
                className="h-64 aspect-video"
              />
            ) : (
              <File className="h-24 w-24 text-muted-foreground p-4" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Size: </span>
              <span className="font-medium">{typeof detailItem.size === "number" ? getFileSize(detailItem.size) : "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Type: </span>
              <span className="font-medium uppercase">{detailItem.extension || "File"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground block text-xs mb-1">Path:</span>
              <div className="flex items-center gap-1">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{detailItem.path}</code>
                <Button
                  size="icon-xs"
                  variant="outline"
                  type="button"
                  title="Copy path"
                  onClick={() => {
                    navigator.clipboard.writeText(detailItem.path);
                    toast.success("Path copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {detailItem.url && (
                  <Button
                    size="icon-xs"
                    variant="outline"
                    type="button"
                    title="Open original"
                    asChild
                  >
                    <a href={detailItem.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  if (!usePageHeader) {
    return (
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        <div className="flex-1 flex flex-col space-y-4">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-x-2 min-w-0 flex-1">
              <Button onClick={handleNavigateParent} size="icon-sm" variant="outline" className="shrink-0" disabled={!path || path === mediaConfig.input}>
                <CornerLeftUp className="w-4 h-4"/>
              </Button>
              <div className="min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-44 sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search in folder..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <MediaHeaderActions
                actionNode={mediaActions.length > 0 ? (
                  <RepoActionButtons
                    actions={mediaActions}
                    owner={config.owner}
                    repo={config.repo}
                    refName={config.branch}
                    contextType="media"
                    contextName={mediaConfig.name}
                    contextPath={path}
                    contextData={{
                      label: mediaConfig.label || mediaConfig.name,
                      input: mediaConfig.input,
                      output: mediaConfig.output,
                    }}
                  />
                ) : undefined}
                mediaName={mediaConfig.name}
                path={path}
                onFolderCreate={handleFolderCreate}
              />
            </div>
          </header>
          {mediaGrid}
          {detailDialog}
        </div>
      </MediaUpload>
    );
  }

  return (
    <div className="flex-1 flex flex-col space-y-4">
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        {mediaGrid}
        {detailDialog}
      </MediaUpload>
    </div>
  );
};

export { MediaView };