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

  // 1. Loop through array fields: {{#each listKey}} ... {{/each}}
  content = content.replace(
    /\{\{#each\s+([a-zA-Z0-9_.-]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match: string, arrayKey: string, template: string) => {
      const list = formValues[arrayKey.trim()];
      if (!Array.isArray(list) || list.length === 0) {
        return `<tr><td colspan="4" style="padding: 14px; text-align: center; color: #94a3b8; font-style: italic;">No redirects created yet</td></tr>`;
      }
      return list
        .filter((item) => item && (item.from || item.to))
        .map((item: any, idx: number) => {
          return template.replace(/\{([^}]+)\}/g, (_m: string, prop: string) => {
            if (prop === "index") return String(idx + 1);
            const val = item?.[prop];
            return val !== undefined && val !== null && val !== "" ? String(val) : "—";
          });
        })
        .join("");
    }
  );

  // 2. Standard scalar variable replacements
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
      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground w-full"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};