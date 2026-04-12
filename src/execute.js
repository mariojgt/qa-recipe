#!/usr/bin/env node
/**
 * QA Recipe - Execute Tool
 *
 * Executes Puppeteer test steps provided as JSON via stdin or --file argument.
 * Designed to be called by an LLM as a tool.
 *
 * Usage:
 *   echo '{"steps":[...]}' | node src/execute.js
 *   node src/execute.js --file steps.json
 *   node src/execute.js --steps '[{"action":"navigate","value":"https://example.com","description":"Go to example"}]'
 *
 * Options:
 *   --headless         Run in headless mode (default: false, so you can watch)
 *   --name <name>      Name for screenshot folder (default: _interactive)
 *   --file <path>      Read steps from a JSON file
 *   --steps <json>     Pass steps JSON directly as argument
 *
 * Output: JSON result with pass/fail per step and screenshot paths.
 */
import 'dotenv/config';
import { launchBrowser, executeStep, closeBrowser } from './browser.js';
import { getScreenshotDir } from './recipe.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: false, name: '_interactive', file: null, steps: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') opts.headless = true;
    else if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--file' && args[i + 1]) opts.file = args[++i];
    else if (args[i] === '--steps' && args[i + 1]) opts.steps = args[++i];
  }

  return opts;
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

async function run() {
  const opts = parseArgs();
  let stepsJson;

  // Read steps from --steps arg, --file, or stdin
  if (opts.steps) {
    stepsJson = opts.steps;
  } else if (opts.file) {
    const fs = await import('fs/promises');
    stepsJson = await fs.default.readFile(opts.file, 'utf-8');
  } else {
    stepsJson = await readStdin();
  }

  if (!stepsJson) {
    console.error(JSON.stringify({
      error: 'No steps provided. Pass via --steps, --file, or pipe JSON to stdin.',
      usage: 'echo \'{"steps":[...]}\' | node src/execute.js',
    }));
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(stepsJson);
  } catch (err) {
    console.error(JSON.stringify({ error: `Invalid JSON: ${err.message}` }));
    process.exit(1);
  }

  const steps = Array.isArray(parsed) ? parsed : parsed.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    console.error(JSON.stringify({ error: 'Steps must be a non-empty array.' }));
    process.exit(1);
  }

  const screenshotDir = getScreenshotDir(opts.name);
  let browser;

  try {
    const { browser: b, page } = await launchBrowser({ headless: opts.headless });
    browser = b;

    const results = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const result = await executeStep(page, step, i, screenshotDir);
      results.push(result);
      if (result.success) passed++;
      else failed++;
    }

    const output = {
      success: failed === 0,
      total: steps.length,
      passed,
      failed,
      screenshotDir,
      results,
    };

    console.log(JSON.stringify(output, null, 2));

    await closeBrowser(browser);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    await closeBrowser(browser);
    process.exit(1);
  }
}

run();
