# QA Recipe — MCP Server for Browser Testing

A standalone [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for automated browser QA testing. Run tests interactively from AI agents (VS Code Copilot, Claude Code) or headlessly from the command line.

## Quick Start

```bash
cd qaRecipe
npm install
```

---

## Setup with VS Code (GitHub Copilot)

### 1. Add the MCP server

Create or edit `.vscode/mcp.json` in your **workspace root**:

```json
{
  "servers": {
    "qa-recipe": {
      "type": "stdio",
      "command": "node",
      "args": ["qaRecipe/src/mcp-server.js"],
      "env": {}
    }
  }
}
```

### 2. Restart the MCP server

Open the Command Palette (`Cmd+Shift+P`) and run:

```
MCP: List Servers
```

Select `qa-recipe` and click **Start** (or **Restart** if already running).

### 3. Use the tools

In Copilot Chat (Agent mode), the following tools become available:

| Tool | Description |
|------|-------------|
| `qa_execute_steps` | Run test steps in a browser and get pass/fail results |
| `qa_save_recipe` | Save steps as a named recipe for later replay |
| `qa_run_recipe` | Run a saved recipe by name |
| `qa_list_recipes` | List all saved recipes |
| `qa_load_recipe` | View the full details of a saved recipe |
| `qa_delete_recipe` | Delete a saved recipe |

Example prompt:

> Navigate to https://example.com, type "hello" into the search box, click submit, and screenshot the result.

---

## Setup with Claude Code

### 1. Add the MCP server

Run this from your **project root**:

```bash
claude mcp add qa-recipe node qaRecipe/src/mcp-server.js
```

Or add it manually to your Claude Code MCP config (`.claude/mcp.json` or `~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "qa-recipe": {
      "command": "node",
      "args": ["/absolute/path/to/qaRecipe/src/mcp-server.js"]
    }
  }
}
```

### 2. Verify

```bash
claude mcp list
```

You should see `qa-recipe` listed. The tools are immediately available in your Claude Code session.

---

## Running Recipes from the Command Line

```bash
# List saved recipes
ls qaRecipe/recipes/

# Run a recipe
node qaRecipe/src/runner.js patchstack-free-register

# Or via npm script (if defined in package.json)
npm run test:patchstack-free-register
```

---

## Available Step Actions

| Action | Required Fields | Description |
|--------|----------------|-------------|
| `navigate` | `value` (URL) | Go to a URL |
| `click` | `selector` | Click an element |
| `type` | `selector`, `value` | Type text into an input |
| `select` | `selector`, `value` | Select a dropdown option |
| `hover` | `selector` | Hover over an element |
| `scroll` | `value` (pixels) | Scroll the page |
| `wait` | `value` (ms) | Wait for a duration |
| `screenshot` | — | Capture a screenshot |
| `assert_url` | `value` | Assert the current URL contains value |
| `assert_text` | `value` | Assert the page contains text |
| `assert_element` | `selector` | Assert an element exists |
| `type_in_iframe` | `iframeUrlMatch`, `iframeInputSelector`, `value` | Type into an input inside an iframe |
| `evaluate` | `value` (JS code) | Run arbitrary JavaScript on the page |
| `click_text` | `value` (text) | Click an element containing specific text |

---

## Template Variables

Use `{{variableName}}` placeholders in recipe step `value`, `selector`, `iframeInputSelector`, or `iframeUrlMatch` fields. Variables are resolved fresh on every run.

| Variable | Example Output | Description |
|----------|---------------|-------------|
| `{{randomEmail}}` | `qa.tester+1775741726393@test-patchstack.dev` | Unique email per run |
| `{{randomPassword}}` | `QaT3st!a1b2c3d41775741726393` | Unique strong password |
| `{{randomPhone}}` | `5551726393` | Unique phone number |
| `{{randomName}}` | `QA Tester a1b2c3d4` | Random full name |
| `{{randomHex}}` | `a1b2c3d4` | 8-char random hex string |
| `{{timestamp}}` | `1775741726393` | Current Unix timestamp (ms) |

### Example recipe step using variables

```json
{
  "action": "type",
  "selector": "input[placeholder=\"Email address\"]",
  "value": "{{randomEmail}}",
  "description": "Enter a unique email address"
}
```

---

## Recipe File Format

Recipes are stored as JSON in `qaRecipe/recipes/`. Example:

```json
{
  "name": "my-test",
  "description": "Describe what this test does",
  "version": 1,
  "config": {
    "headless": true,
    "viewportWidth": 1280,
    "viewportHeight": 900,
    "timeout": 30000
  },
  "steps": [
    { "action": "navigate", "value": "https://example.com", "description": "Open page" },
    { "action": "type", "selector": "#email", "value": "{{randomEmail}}", "description": "Fill email" },
    { "action": "click", "selector": "button[type=submit]", "description": "Submit form" },
    { "action": "screenshot", "description": "Capture result" }
  ]
}
```

---

## Screenshots

Every step captures a screenshot automatically. They are saved to:

```
qaRecipe/screenshots/<recipe-name>/<ISO-timestamp>/
```

---

## Project Structure

```
qaRecipe/
├── package.json
├── recipes/                 # Saved test recipes (JSON)
├── screenshots/             # Test run screenshots
└── src/
    ├── mcp-server.js        # MCP server entry point
    ├── browser.js           # Puppeteer browser automation engine
    ├── execute.js            # Step execution logic
    ├── runner.js             # CLI recipe runner
    ├── recipe.js             # Recipe load/save/list utilities
    ├── save-recipe.js        # CLI recipe saver
    └── variables.js          # Template variable resolution
```
