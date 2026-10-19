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

  // 1. Live parser & renderer for redirects YAML table: {{#redirects_table fieldName}}
  content = content.replace(
    /\{\{#redirects_table(?:\s+([a-zA-Z0-9_.-]+))?\}\}/g,
    (_match: string, sourceField: string = "body") => {
      const rawText = String(formValues[sourceField] || "");
      const lines = rawText
        .split("\n")
        .filter((l) => !l.trim().startsWith("#"))
        .join("\n");
      const items = lines.split(/\n\s*-\s+/).slice(1);

      const parsedRules: Array<{ from: string; to: string; status: number }> = [];

      for (const item of items) {
        const fromMatch = item.match(/from:\s*['"]?([^'"\r\n]+)['"]?/);
        const toMatch = item.match(/to:\s*['"]?([^'"\r\n]+)['"]?/);
        const statusMatch = item.match(/status:\s*['"]?(\d+)['"]?/);

        if (!fromMatch || !toMatch) continue;
        parsedRules.push({
          from: fromMatch[1].trim(),
          to: toMatch[1].trim(),
          status: statusMatch ? parseInt(statusMatch[1], 10) : 301,
        });
      }

      if (parsedRules.length === 0) {
        return `
          <div style="padding: 20px; text-align: center; color: #94a3b8; font-style: italic; border: 1px dashed #e2e8f0; border-radius: 8px; font-size: 12px;">
            No active redirects found in text. Paste or write rules above to populate this table.
          </div>
        `;
      }

      const rows = parsedRules
        .map(
          (rule, idx) => `
          <tr style="border-bottom: 1px solid #f1f5f9; color: #334155;">
            <td style="padding: 10px 8px; color: #94a3b8; font-size: 11px;">${idx + 1}</td>
            <td style="padding: 10px 8px; font-family: monospace; font-size: 12px; font-weight: 500; color: #b91c1c;">${rule.from}</td>
            <td style="padding: 10px 8px; text-align: center; color: #94a3b8;">→</td>
            <td style="padding: 10px 8px; font-family: monospace; font-size: 12px; font-weight: 500; color: #15803d;">${rule.to}</td>
            <td style="padding: 10px 8px; text-align: right;">
              <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; border: 1px solid #bfdbfe;">
                HTTP ${rule.status}
              </span>
            </td>
          </tr>
        `
        )
        .join("");

      return `
        <div style="font-family: inherit; font-size: 13px; width: 100%; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                <th style="padding: 10px 8px; width: 40px;">#</th>
                <th style="padding: 10px 8px;">From (Source)</th>
                <th style="padding: 10px 8px; width: 28px; text-align: center;"></th>
                <th style="padding: 10px 8px;">To (Destination)</th>
                <th style="padding: 10px 8px; text-align: right; width: 90px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }
  );

  // 2. Loop through generic array fields: {{#each listKey}} ... {{/each}}
  content = content.replace(
    /\{\{#each\s+([a-zA-Z0-9_.-]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match: string, arrayKey: string, template: string) => {
      const list = formValues[arrayKey.trim()];
      if (!Array.isArray(list) || list.length === 0) return "";
      return list
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

  // 3. Standard scalar variable replacements
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