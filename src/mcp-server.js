#!/usr/bin/env node

/**
 * QA Recipe - MCP Server
 *
 * Standalone Model Context Protocol server for QA testing.
 * Exposes browser automation and recipe management as MCP tools.
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchBrowser, executeStep, closeBrowser } from './browser.js';
import { saveRecipe, loadRecipe, listRecipes, getScreenshotDir } from './recipe.js';
import { resolveVariables } from './variables.js';

const server = new McpServer({
  name: 'qa-recipe',
  version: '1.0.0',
});

// ─── Shared Step Schema ────────────────────────────────────────────────────────

const StepSchema = z.object({
  action: z.enum([
    'navigate',
    'click',
    'type',
    'select',
    'hover',
    'scroll',
    'wait',
    'screenshot',
    'assert_url',
    'assert_text',
    'assert_element',
    'type_in_iframe',
    'evaluate',
    'click_text',
  ]).describe('The action to perform'),
  selector: z.string().optional().describe('CSS selector for the target element (required for click, type, select, hover, assert_element)'),
  value: z.string().optional().describe('Value for the action (URL for navigate, text for type, assertion value, scroll pixels, wait ms)'),
  description: z.string().describe('Human-readable description of this step'),
  screenshot: z.boolean().optional().default(true).describe('Whether to take a screenshot after this step'),
  iframeSelector: z.string().optional().describe('CSS selector for the iframe element (for type_in_iframe)'),
  iframeInputSelector: z.string().optional().describe('CSS selector for the input INSIDE the iframe (for type_in_iframe, defaults to "input")'),
  iframeUrlMatch: z.string().optional().describe('Substring to match against iframe URLs to find the right frame (for type_in_iframe)'),
});

// ─── Tool: qa_execute_steps ────────────────────────────────────────────────────

server.tool(
  'qa_execute_steps',
  'Execute QA test steps in a browser. Each step performs a browser action (navigate, click, type, assert, etc.) and captures screenshots. Returns pass/fail results per step.',
  {
    steps: z.array(StepSchema).min(1).describe('Array of test steps to execute sequentially'),
    headless: z.boolean().optional().default(true).describe('Run browser in headless mode (true) or with visible UI (false)'),
    name: z.string().optional().default('_interactive').describe('Name for the screenshot folder'),
    viewportWidth: z.number().int().optional().default(1280).describe('Browser viewport width'),
    viewportHeight: z.number().int().optional().default(800).describe('Browser viewport height'),
    timeout: z.number().int().optional().default(30000).describe('Default timeout in milliseconds'),
  },
  async (params) => {
    let browser;
    try {
      const screenshotDir = getScreenshotDir(params.name);
      const launched = await launchBrowser({
        headless: params.headless,
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        timeout: params.timeout,
      });
      browser = launched.browser;
      const page = launched.page;

      const resolvedSteps = resolveVariables(params.steps);
      const results = [];
      let passed = 0;
      let failed = 0;

      for (let i = 0; i < resolvedSteps.length; i++) {
        const step = resolvedSteps[i];
        const result = await executeStep(page, step, i, screenshotDir);
        results.push(result);
        if (result.success) passed++;
        else failed++;
      }

      await closeBrowser(browser);

      const output = {
        success: failed === 0,
        total: resolvedSteps.length,
        passed,
        failed,
        screenshotDir,
        results,
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2),
        }],
      };
    } catch (error) {
      await closeBrowser(browser);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error executing steps: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: qa_save_recipe ──────────────────────────────────────────────────────

server.tool(
  'qa_save_recipe',
  'Save a set of QA test steps as a named recipe for later replay. Recipes are stored as JSON files and can be re-run with qa_run_recipe.',
  {
    name: z.string().min(1).describe('Name for the recipe (will be sanitized to lowercase alphanumeric + hyphens)'),
    steps: z.array(StepSchema).min(1).describe('Array of test steps to save'),
    description: z.string().optional().default('').describe('Human-readable description of what this recipe tests'),
    headless: z.boolean().optional().default(true).describe('Default headless mode when running this recipe'),
    viewportWidth: z.number().int().optional().default(1280).describe('Default viewport width'),
    viewportHeight: z.number().int().optional().default(800).describe('Default viewport height'),
    timeout: z.number().int().optional().default(30000).describe('Default timeout in milliseconds'),
  },
  async (params) => {
    try {
      const { safeName, recipePath } = await saveRecipe(params.name, {
        steps: params.steps,
        source: 'mcp',
        description: params.description || `QA test: ${params.name}`,
        config: {
          headless: params.headless,
          viewportWidth: params.viewportWidth,
          viewportHeight: params.viewportHeight,
          timeout: params.timeout,
        },
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            recipeName: safeName,
            recipePath,
            runCommand: `npm run test:${safeName}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error saving recipe: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: qa_run_recipe ───────────────────────────────────────────────────────

server.tool(
  'qa_run_recipe',
  'Run a previously saved QA recipe by name. Launches a browser, executes all steps, captures screenshots, and returns pass/fail results.',
  {
    name: z.string().min(1).describe('Name of the recipe to run'),
    headless: z.boolean().optional().describe('Override the recipe headless setting'),
  },
  async (params) => {
    let browser;
    try {
      const recipe = await loadRecipe(params.name);
      const config = { ...recipe.config };
      if (params.headless !== undefined) {
        config.headless = params.headless;
      }

      const screenshotDir = getScreenshotDir(recipe.name);
      const launched = await launchBrowser(config);
      browser = launched.browser;
      const page = launched.page;

      const results = [];
      let passed = 0;
      let failed = 0;

      for (let i = 0; i < recipe.steps.length; i++) {
        const step = recipe.steps[i];
        const result = await executeStep(page, step, i, screenshotDir);
        results.push(result);
        if (result.success) passed++;
        else failed++;
      }

      await closeBrowser(browser);

      const output = {
        recipeName: recipe.name,
        description: recipe.description,
        success: failed === 0,
        total: recipe.steps.length,
        passed,
        failed,
        screenshotDir,
        results,
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2),
        }],
      };
    } catch (error) {
      await closeBrowser(browser);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error running recipe: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: qa_list_recipes ─────────────────────────────────────────────────────

server.tool(
  'qa_list_recipes',
  'List all saved QA recipes available to run.',
  {},
  async () => {
    try {
      const recipes = await listRecipes();
      if (recipes.length === 0) {
        return {
          content: [{ type: 'text', text: 'No recipes saved yet. Use qa_save_recipe to create one.' }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ recipes, total: recipes.length }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error listing recipes: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: qa_load_recipe ──────────────────────────────────────────────────────

server.tool(
  'qa_load_recipe',
  'Load and display the full details of a saved QA recipe, including all steps and configuration.',
  {
    name: z.string().min(1).describe('Name of the recipe to load'),
  },
  async (params) => {
    try {
      const recipe = await loadRecipe(params.name);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(recipe, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error loading recipe: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: qa_delete_recipe ────────────────────────────────────────────────────

server.tool(
  'qa_delete_recipe',
  'Delete a saved QA recipe by name.',
  {
    name: z.string().min(1).describe('Name of the recipe to delete'),
  },
  async (params) => {
    try {
      const { default: fs } = await import('fs/promises');
      const { default: path } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const recipesDir = path.join(__dirname, '..', 'recipes');

      const safeName = params.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const recipePath = path.join(recipesDir, `${safeName}.json`);

      try {
        await fs.access(recipePath);
      } catch {
        const available = await listRecipes();
        const list = available.length > 0 ? available.join(', ') : 'none';
        throw new Error(`Recipe "${safeName}" not found. Available: ${list}`);
      }

      await fs.unlink(recipePath);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, deleted: safeName }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error deleting recipe: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start QA Recipe MCP server:', err);
  process.exit(1);
});
