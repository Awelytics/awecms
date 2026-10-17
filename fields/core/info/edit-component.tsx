"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";

export const EditComponent = ({ field }: { field: any }) => {
  const { control } = useFormContext();
  const formValues = useWatch({ control }) || {};
  const { owner, repo } = useRepo();
  const { config } = useConfig();
  
  const branch = config?.branch || "";

  let content: string = field.content || "";

  // Replace {name} with form or context values, or fallback to an empty string if not filled yet
  content = content.replace(/\{([^}]+)\}/g, (_match: string, key: string) => {
    if (key === "owner") return owner;
    if (key === "repo") return repo;
    if (key === "branch") return branch;
    if (formValues[key] !== undefined && formValues[key] !== null && formValues[key] !== "") {
      return String(formValues[key]);
    }
    return "";
  });

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};