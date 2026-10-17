"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";

export const EditComponent = ({ field }: { field: any }) => {
  const { control } = useFormContext();
  const formValues = useWatch({ control }) || {};
  const { owner, repo } = useRepo();
  const { config } = useConfig();
  
  // The current branch is stored in the config context
  const branch = config?.branch || "";

  let content: string = field.content || "";

  // Simple interpolator: replaces {name} with a value from the form or context
  content = content.replace(/\{([^}]+)\}/g, (match: string, key: string) => {
    if (key === "owner") return owner;
    if (key === "repo") return repo;
    if (key === "branch") return branch;
    if (formValues[key] !== undefined) return String(formValues[key]);
    return match;
  });

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};