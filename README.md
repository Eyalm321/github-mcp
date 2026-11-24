# github-mcp

MCP server for the GitHub REST API — 1,281 tools covering all 46 API categories.

Auto-generated from [GitHub's OpenAPI spec](https://github.com/github/rest-api-description) using a code generator that produces typed tool definitions with Zod validation.

## Installation

```bash
npm install github-rest-mcp
```

Or from GitHub Packages:

```bash
npm install @eyalm321/github-mcp
```

## Configuration

Set your GitHub Personal Access Token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### Category Filter

By default all 1,281 tools are registered. To enable only specific categories:

```bash
export GITHUB_MCP_CATEGORIES=repos,issues,pulls,actions
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "github-rest-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "GITHUB_MCP_CATEGORIES": "repos,issues,pulls,actions,users,orgs,git,search"
      }
    }
  }
}
```

## API Categories

| Category | Tools | Category | Tools |
|----------|-------|----------|-------|
| actions | 200 | activity | 34 |
| agent-automations | 12 | agent-merge | 3 |
| agent-tasks | 5 | agents | 30 |
| apps | 37 | billing | 13 |
| campaigns | 5 | checks | 12 |
| classroom | 6 | code-quality | 4 |
| code-scanning | 25 | code-security | 20 |
| codes-of-conduct | 2 | codespaces | 48 |
| copilot | 44 | copilot-spaces | 28 |
| credentials | 1 | dependabot | 27 |
| dependency-graph | 5 | emojis | 1 |
| gists | 20 | git | 13 |
| gitignore | 2 | hosted-compute | 6 |
| interactions | 16 | issues | 66 |
| licenses | 3 | markdown | 2 |
| meta | 5 | migrations | 22 |
| oidc | 8 | orgs | 116 |
| packages | 27 | private-registries | 6 |
| projects | 26 | pulls | 36 |
| rate-limit | 1 | reactions | 15 |
| repos | 204 | search | 7 |
| secret-scanning | 17 | security-advisories | 14 |
| teams | 32 | users | 55 |

## Tool Naming

Tools follow the pattern `github_{category}_{action}`, derived from GitHub's operation IDs:

- `github_repos_get` — Get a repository
- `github_issues_create` — Create an issue
- `github_pulls_list` — List pull requests
- `github_actions_list_workflow_runs` — List workflow runs

## Development

```bash
# Install dependencies
npm install

# Regenerate tools from OpenAPI spec
npm run generate

# Build
npm run build

# Run tests
npm test

# Start the server
npm start
```

## Regenerating Tools

The tool files in `src/tools/` are auto-generated from GitHub's OpenAPI spec. The generator runs as TypeScript straight under Node, so it needs Node 22.18 or newer (type stripping on by default). To update:

```bash
# Delete cached spec to force re-download
rm -f api-description.json

# Regenerate
npm run generate
```

## License

MIT
