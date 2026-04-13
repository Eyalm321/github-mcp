import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { githubRequest } from "../client.js";

describe("githubRequest", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws if GITHUB_TOKEN is not set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    await expect(githubRequest("GET", "/user")).rejects.toThrow(
      "GITHUB_TOKEN environment variable is not set"
    );
  });

  it("makes GET request with correct URL and headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ login: "octocat" }),
    });

    await githubRequest("GET", "/user");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test_token_123",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "github-mcp/1.0.0",
        }),
        body: undefined,
      })
    );
  });

  it("makes POST request with body and Content-Type header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 1 }),
    });

    await githubRequest("POST", "/user/repos", { name: "test-repo" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/user/repos",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "test-repo" }),
      })
    );
  });

  it("appends query params and filters undefined/null/empty values", async () => {
    let capturedUrl = "";
    mockFetch.mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
    });

    await githubRequest("GET", "/repos/octocat/hello-world/issues", undefined, {
      state: "open",
      per_page: 30,
      labels: undefined,
      empty: undefined,
    });

    const url = new URL(capturedUrl);
    expect(url.searchParams.get("state")).toBe("open");
    expect(url.searchParams.get("per_page")).toBe("30");
    expect(url.searchParams.has("labels")).toBe(false);
    expect(url.searchParams.has("empty")).toBe(false);
  });

  it("handles array query params with comma join", async () => {
    let capturedUrl = "";
    mockFetch.mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
    });

    await githubRequest("GET", "/repos/octocat/hello-world/issues", undefined, {
      labels: ["bug", "enhancement"] as any,
    });

    const url = new URL(capturedUrl);
    expect(url.searchParams.get("labels")).toBe("bug,enhancement");
  });

  it("returns parsed JSON on success", async () => {
    const expected = { login: "octocat", id: 1 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(expected),
    });

    const result = await githubRequest("GET", "/user");
    expect(result).toEqual(expected);
  });

  it("handles 204 No Content response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await githubRequest("DELETE", "/repos/octocat/hello-world");
    expect(result).toEqual({});
  });

  it("throws with GitHub error message format", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            message: "Validation Failed",
            errors: [{ resource: "Issue", code: "missing_field", field: "title" }],
          })
        ),
    });

    await expect(githubRequest("POST", "/repos/octocat/hello-world/issues", {})).rejects.toThrow(
      'GitHub API error 422: Validation Failed -- [{"resource":"Issue","code":"missing_field","field":"title"}]'
    );
  });

  it("throws on non-2xx response with plain text", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Bad credentials"),
    });

    await expect(githubRequest("GET", "/user")).rejects.toThrow(
      "GitHub API error 401: Bad credentials"
    );
  });

  it("handles text() failure gracefully on error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("parse failed")),
    });

    await expect(githubRequest("GET", "/user")).rejects.toThrow(
      "GitHub API error 500:"
    );
  });
});
