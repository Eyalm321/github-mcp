import { describe, it, expect } from "vitest";
import * as allExports from "../tools/index.js";

describe("All tools integration", () => {
  const allToolArrays = Object.values(allExports);
  const allTools = allToolArrays.flat();

  it("exports at least 1000 tools total", () => {
    expect(allTools.length).toBeGreaterThanOrEqual(1000);
  });

  it("has no duplicate tool names across all categories", () => {
    const names = allTools.map((t: any) => t.name);
    const duplicates = names.filter((name: string, i: number) => names.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it("all tools have required properties", () => {
    for (const tool of allTools) {
      const t = tool as any;
      expect(t.name).toBeTruthy();
      expect(typeof t.name).toBe("string");
      expect(t.name.startsWith("github_")).toBe(true);
      expect(t.description).toBeTruthy();
      expect(typeof t.description).toBe("string");
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.handler).toBe("function");
    }
  });

  it("all tool names use only valid characters", () => {
    for (const tool of allTools) {
      const t = tool as any;
      expect(t.name).toMatch(/^github_[a-z0-9_]+$/);
    }
  });

  it("exports tools from all expected categories", () => {
    const expectedCategories = [
      "repos", "actions", "issues", "orgs", "users", "pulls",
      "codespaces", "teams", "apps", "git", "checks",
    ];
    const exportNames = Object.keys(allExports);
    for (const cat of expectedCategories) {
      const camelName = cat.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Tools";
      expect(exportNames).toContain(camelName);
    }
  });
});
