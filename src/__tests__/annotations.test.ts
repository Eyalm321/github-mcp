import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client.js", () => ({
  githubRequest: vi.fn().mockResolvedValue({ success: true }),
}));

import { githubRequest } from "../client.js";
import * as allExports from "../tools/index.js";

const mockRequest = vi.mocked(githubRequest);
const allTools = Object.values(allExports).flat() as any[];

// Annotations come from the generator; this checks every tool's against the HTTP method its handler sends.
describe("tool annotations match the HTTP method", () => {
  beforeEach(() => { mockRequest.mockClear(); });

  it("every tool carries annotations", () => {
    for (const t of allTools) {
      expect(typeof t.annotations?.readOnlyHint, t.name).toBe("boolean");
      expect(t.annotations.openWorldHint, t.name).toBe(true);
    }
  });

  it("GET is read-only; DELETE destructive and idempotent; PUT idempotent; POST/PATCH neither", async () => {
    const seen: Record<string, number> = {};
    for (const t of allTools) {
      mockRequest.mockClear();
      await t.handler({});
      const method = mockRequest.mock.calls[0][0] as string;
      seen[method] = (seen[method] ?? 0) + 1;
      const a = t.annotations;
      expect(a.readOnlyHint, t.name).toBe(method === "GET");
      expect(a.destructiveHint, t.name).toBe(method === "DELETE" ? true : undefined);
      expect(a.idempotentHint, t.name).toBe(method === "PUT" || method === "DELETE" ? true : undefined);
    }
    expect(Object.keys(seen).sort()).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
  });
});
