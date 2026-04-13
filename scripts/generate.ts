#!/usr/bin/env ts-node
/**
 * Code generator: parses GitHub's OpenAPI spec and generates MCP tool files.
 *
 * Usage: npm run generate
 *
 * Downloads the spec from github/rest-api-description and produces:
 *   src/tools/{category}.ts   — tool definitions per API category
 *   src/tools/index.ts        — barrel export
 *   src/index.ts              — MCP server entry point
 *   src/__tests__/tools/{category}.test.ts — per-category tests
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

// ─── Config ──────────────────────────────────────────────────────────────────

const SPEC_URL =
  "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json";
const SPEC_CACHE = path.join(__dirname, "..", "api-description.json");
const SRC_DIR = path.join(__dirname, "..", "src");
const TOOLS_DIR = path.join(SRC_DIR, "tools");
const TESTS_DIR = path.join(SRC_DIR, "__tests__", "tools");

// ─── Types ───────────────────────────────────────────────────────────────────

interface OpenAPISpec {
  paths: Record<string, Record<string, OperationObject>>;
  components?: { parameters?: Record<string, ParameterObject>; schemas?: Record<string, any> };
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: (ParameterObject | RefObject)[];
  requestBody?: { content?: Record<string, { schema?: any }> } | RefObject;
  deprecated?: boolean;
}

interface ParameterObject {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface SchemaObject {
  type?: string;
  enum?: string[];
  items?: SchemaObject;
  default?: any;
  format?: string;
}

interface RefObject {
  $ref: string;
}

interface ToolDef {
  name: string;
  description: string;
  method: string;
  urlPath: string;
  pathParams: string[];
  queryParams: ParamDef[];
  hasBody: boolean;
  operationId: string;
}

interface ParamDef {
  name: string;
  description: string;
  required: boolean;
  zodType: string;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

export function operationIdToToolName(operationId: string): string {
  return "github_" + operationId.replace(/[\/\-]/g, "_");
}

export function extractPathParams(urlPath: string): string[] {
  const matches = urlPath.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

export function schemaToZodType(schema?: SchemaObject): string {
  if (!schema || !schema.type) return "z.unknown()";

  if (schema.enum && schema.enum.length > 0) {
    const vals = schema.enum.map((v) => JSON.stringify(v)).join(", ");
    return `z.enum([${vals}])`;
  }

  switch (schema.type) {
    case "string":
      return "z.string()";
    case "integer":
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "array":
      if (schema.items) {
        return `z.array(${schemaToZodType(schema.items)})`;
      }
      return "z.array(z.unknown())";
    case "object":
      return "z.record(z.string(), z.unknown())";
    default:
      return "z.unknown()";
  }
}

function resolveRef(spec: OpenAPISpec, ref: string): any {
  // e.g. "#/components/parameters/per-page"
  const parts = ref.replace("#/", "").split("/");
  let current: any = spec;
  for (const part of parts) {
    current = current?.[part];
    if (!current) return undefined;
  }
  return current;
}

function resolveParam(spec: OpenAPISpec, param: ParameterObject | RefObject): ParameterObject | undefined {
  if ("$ref" in param) {
    return resolveRef(spec, param.$ref) as ParameterObject | undefined;
  }
  return param as ParameterObject;
}

function escapeStr(s: string): string {
  // Don't escape $ — we need ${args.xxx} interpolation to work in template literals
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function escapeDescription(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").trim();
}

function toCamelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function sanitizeParamName(name: string): string {
  // Some GitHub param names contain special chars like []
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ─── Spec Download ───────────────────────────────────────────────────────────

function downloadSpec(): Promise<OpenAPISpec> {
  if (fs.existsSync(SPEC_CACHE)) {
    console.log("Using cached spec:", SPEC_CACHE);
    return Promise.resolve(JSON.parse(fs.readFileSync(SPEC_CACHE, "utf-8")));
  }

  console.log("Downloading OpenAPI spec from GitHub...");
  return new Promise((resolve, reject) => {
    const get = (url: string) => {
      https.get(url, { headers: { "User-Agent": "github-mcp-generator" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading spec`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          fs.writeFileSync(SPEC_CACHE, data);
          console.log("Spec cached to:", SPEC_CACHE);
          resolve(JSON.parse(data));
        });
        res.on("error", reject);
      });
    };
    get(SPEC_URL);
  });
}

// ─── Parse Operations ────────────────────────────────────────────────────────

function parseOperations(spec: OpenAPISpec): Map<string, ToolDef[]> {
  const categories = new Map<string, ToolDef[]>();
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

  for (const [urlPath, methods] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as OperationObject | undefined;
      if (!op || !op.operationId) continue;

      const tag = op.tags?.[0] || "misc";
      const toolName = operationIdToToolName(op.operationId);
      const pathParams = extractPathParams(urlPath);

      // Resolve and collect query params
      const queryParams: ParamDef[] = [];
      if (op.parameters) {
        for (const rawParam of op.parameters) {
          const param = resolveParam(spec, rawParam);
          if (!param) continue;
          if (param.in === "query") {
            queryParams.push({
              name: sanitizeParamName(param.name),
              description: escapeDescription(param.description || param.name),
              required: param.required || false,
              zodType: schemaToZodType(param.schema),
            });
          }
        }
      }

      // Detect request body
      const hasBody =
        (method === "post" || method === "put" || method === "patch") &&
        op.requestBody !== undefined;

      const description = escapeDescription(
        op.summary || op.description || op.operationId
      );

      if (!categories.has(tag)) categories.set(tag, []);
      categories.get(tag)!.push({
        name: toolName,
        description,
        method: method.toUpperCase(),
        urlPath,
        pathParams,
        queryParams,
        hasBody,
        operationId: op.operationId,
      });
    }
  }

  return categories;
}

// ─── Code Generation ─────────────────────────────────────────────────────────

function generateToolFile(category: string, tools: ToolDef[]): string {
  const lines: string[] = [];
  lines.push("// AUTO-GENERATED by scripts/generate.ts — DO NOT EDIT");
  lines.push('import { z } from "zod";');
  lines.push('import { githubRequest } from "../client.js";');
  lines.push("");

  const exportName = toCamelCase(category) + "Tools";
  lines.push(`export const ${exportName} = [`);

  for (const tool of tools) {
    lines.push("  {");
    lines.push(`    name: "${tool.name}",`);
    lines.push(`    description: "${tool.description}",`);

    // Build Zod schema
    const schemaFields: string[] = [];

    // Path params — always required strings
    for (const p of tool.pathParams) {
      const safe = sanitizeParamName(p);
      schemaFields.push(`      ${safe}: z.string().describe("${escapeDescription(p)}")`);
    }

    // Query params
    for (const q of tool.queryParams) {
      const zodExpr = q.required
        ? `${q.zodType}.describe("${q.description}")`
        : `${q.zodType}.optional().describe("${q.description}")`;
      schemaFields.push(`      ${q.name}: ${zodExpr}`);
    }

    // Request body
    if (tool.hasBody) {
      schemaFields.push(
        `      body: z.record(z.string(), z.unknown()).optional().describe("Request body (JSON object)")`
      );
    }

    if (schemaFields.length > 0) {
      lines.push("    inputSchema: z.object({");
      lines.push(schemaFields.join(",\n"));
      lines.push("    }),");
    } else {
      lines.push("    inputSchema: z.object({}),");
    }

    // Build handler
    lines.push("    handler: async (args: Record<string, any>) => {");

    // Build the URL with path param interpolation
    const interpolatedPath = tool.urlPath.replace(/\{([^}]+)\}/g, (_, p) => {
      return "${args." + sanitizeParamName(p) + "}";
    });

    // Build query params object
    const queryParamEntries = tool.queryParams
      .map((q) => `${q.name}: args.${q.name}`)
      .join(", ");
    const queryObj = tool.queryParams.length > 0 ? `{ ${queryParamEntries} }` : "undefined";

    const bodyArg = tool.hasBody ? "args.body" : "undefined";

    lines.push(
      `      return githubRequest("${tool.method}", \`${escapeStr(interpolatedPath)}\`, ${bodyArg}, ${queryObj});`
    );
    lines.push("    },");
    lines.push("  },");
  }

  lines.push("];");
  lines.push("");

  return lines.join("\n");
}

function generateBarrelFile(categories: string[]): string {
  const lines: string[] = [];
  lines.push("// AUTO-GENERATED by scripts/generate.ts — DO NOT EDIT");
  for (const cat of categories) {
    const exportName = toCamelCase(cat) + "Tools";
    lines.push(`export { ${exportName} } from "./${cat}.js";`);
  }
  lines.push("");
  return lines.join("\n");
}

function generateIndexFile(categories: string[]): string {
  const lines: string[] = [];
  lines.push("#!/usr/bin/env node");
  lines.push("// AUTO-GENERATED by scripts/generate.ts — DO NOT EDIT");
  lines.push('import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";');
  lines.push('import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";');

  for (const cat of categories) {
    const exportName = toCamelCase(cat) + "Tools";
    lines.push(`import { ${exportName} } from "./tools/${cat}.js";`);
  }

  lines.push("");
  lines.push('const server = new McpServer({');
  lines.push('  name: "github-mcp",');
  lines.push('  version: "1.0.0",');
  lines.push("});");
  lines.push("");

  lines.push("const allToolModules = [");
  for (const cat of categories) {
    const exportName = toCamelCase(cat) + "Tools";
    lines.push(`  { category: "${cat}", tools: ${exportName} },`);
  }
  lines.push("];");
  lines.push("");

  lines.push("const enabledCategories = process.env.GITHUB_MCP_CATEGORIES");
  lines.push('  ? new Set(process.env.GITHUB_MCP_CATEGORIES.split(",").map((s) => s.trim()))');
  lines.push("  : null;");
  lines.push("");
  lines.push("const allTools = allToolModules");
  lines.push("  .filter((m) => !enabledCategories || enabledCategories.has(m.category))");
  lines.push("  .flatMap((m) => m.tools);");
  lines.push("");

  lines.push("for (const tool of allTools) {");
  lines.push("  server.tool(");
  lines.push("    tool.name,");
  lines.push("    tool.description,");
  lines.push("    tool.inputSchema.shape as any,");
  lines.push("    async (args: any) => {");
  lines.push("      try {");
  lines.push("        const result = await tool.handler(args as any);");
  lines.push("        return {");
  lines.push('          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],');
  lines.push("        };");
  lines.push("      } catch (err) {");
  lines.push("        const message = err instanceof Error ? err.message : String(err);");
  lines.push("        return {");
  lines.push("          content: [{ type: \"text\" as const, text: `Error: ${message}` }],");
  lines.push("          isError: true,");
  lines.push("        };");
  lines.push("      }");
  lines.push("    }");
  lines.push("  );");
  lines.push("}");
  lines.push("");

  lines.push("async function main() {");
  lines.push("  const transport = new StdioServerTransport();");
  lines.push("  await server.connect(transport);");
  lines.push("  console.error(`GitHub MCP server running (${allTools.length} tools registered)`);");
  lines.push("}");
  lines.push("");
  lines.push("main().catch((err) => {");
  lines.push('  console.error("Fatal error:", err);');
  lines.push("  process.exit(1);");
  lines.push("});");
  lines.push("");

  return lines.join("\n");
}

function generateTestFile(category: string, tools: ToolDef[]): string {
  const exportName = toCamelCase(category) + "Tools";
  const lines: string[] = [];

  lines.push("// AUTO-GENERATED by scripts/generate.ts — DO NOT EDIT");
  lines.push('import { describe, it, expect, vi, beforeEach } from "vitest";');
  lines.push("");
  lines.push('vi.mock("../../client.js", () => ({');
  lines.push("  githubRequest: vi.fn().mockResolvedValue({ success: true }),");
  lines.push("}));");
  lines.push("");
  lines.push('import { githubRequest } from "../../client.js";');
  lines.push(`import { ${exportName} } from "../../tools/${category}.js";`);
  lines.push("");
  lines.push("const mockRequest = vi.mocked(githubRequest);");
  lines.push("");
  lines.push(`describe("${exportName}", () => {`);
  lines.push("  beforeEach(() => { mockRequest.mockClear(); });");
  lines.push("");
  lines.push(`  it("exports ${tools.length} tools", () => {`);
  lines.push(`    expect(${exportName}).toHaveLength(${tools.length});`);
  lines.push("  });");
  lines.push("");
  lines.push("  it(\"has no duplicate tool names\", () => {");
  lines.push(`    const names = ${exportName}.map((t: any) => t.name);`);
  lines.push("    expect(new Set(names).size).toBe(names.length);");
  lines.push("  });");
  lines.push("");

  // Generate handler test for first tool that has path params (or just the first tool)
  const testTools = tools.slice(0, Math.min(3, tools.length));
  for (const tool of testTools) {
    lines.push(`  describe("${tool.name}", () => {`);
    lines.push(`    const tool = ${exportName}.find((t: any) => t.name === "${tool.name}")!;`);
    lines.push("");
    lines.push('    it("exists and has required properties", () => {');
    lines.push("      expect(tool).toBeDefined();");
    lines.push('      expect(tool.name).toBe("' + tool.name + '");');
    lines.push("      expect(tool.description).toBeTruthy();");
    lines.push("      expect(tool.inputSchema).toBeDefined();");
    lines.push("      expect(tool.handler).toBeInstanceOf(Function);");
    lines.push("    });");
    lines.push("");

    // Build sample args for handler test
    const sampleArgs: Record<string, string> = {};
    for (const p of tool.pathParams) {
      sampleArgs[sanitizeParamName(p)] = '"test-value"';
    }
    for (const q of tool.queryParams.slice(0, 2)) {
      if (q.zodType === "z.string()") sampleArgs[q.name] = '"test"';
      else if (q.zodType === "z.number()") sampleArgs[q.name] = "1";
      else if (q.zodType === "z.boolean()") sampleArgs[q.name] = "true";
    }
    if (tool.hasBody) sampleArgs["body"] = "{ test: true }";

    const argsStr = Object.entries(sampleArgs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    lines.push('    it("calls githubRequest", async () => {');
    lines.push(`      await tool.handler({ ${argsStr} });`);
    lines.push("      expect(mockRequest).toHaveBeenCalledTimes(1);");
    lines.push(`      expect(mockRequest.mock.calls[0][0]).toBe("${tool.method}");`);
    lines.push("    });");

    lines.push("  });");
    lines.push("");
  }

  lines.push("});");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const spec = await downloadSpec();
  const categories = parseOperations(spec);

  // Sort categories alphabetically
  const sortedCategories = [...categories.keys()].sort();

  console.log(`\nParsed ${sortedCategories.length} categories:`);
  let totalTools = 0;

  // Ensure output dirs exist
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.mkdirSync(TESTS_DIR, { recursive: true });

  for (const cat of sortedCategories) {
    const tools = categories.get(cat)!;
    totalTools += tools.length;
    console.log(`  ${cat}: ${tools.length} tools`);

    // Write tool file
    const toolCode = generateToolFile(cat, tools);
    fs.writeFileSync(path.join(TOOLS_DIR, `${cat}.ts`), toolCode);

    // Write test file
    const testCode = generateTestFile(cat, tools);
    fs.writeFileSync(path.join(TESTS_DIR, `${cat}.test.ts`), testCode);
  }

  // Write barrel file
  const barrelCode = generateBarrelFile(sortedCategories);
  fs.writeFileSync(path.join(TOOLS_DIR, "index.ts"), barrelCode);

  // Write index.ts
  const indexCode = generateIndexFile(sortedCategories);
  fs.writeFileSync(path.join(SRC_DIR, "index.ts"), indexCode);

  console.log(`\nGenerated ${totalTools} tools across ${sortedCategories.length} categories.`);
  console.log("Files written:");
  console.log(`  ${sortedCategories.length} tool files in src/tools/`);
  console.log(`  ${sortedCategories.length} test files in src/__tests__/tools/`);
  console.log("  src/tools/index.ts (barrel)");
  console.log("  src/index.ts (entry point)");
}

main().catch((err) => {
  console.error("Generator failed:", err);
  process.exit(1);
});
