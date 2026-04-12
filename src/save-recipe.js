#!/usr/bin/env node
/**
 * QA Recipe - Save Tool
 *
 * Saves test steps as a named recipe so it can be replayed with:
 *   npm run test:<recipe-name>
 *
 * Usage:
 *   echo '{"steps":[...]}' | node src/save-recipe.js <name> [description]
 *   node src/save-recipe.js <name> --steps '[...]' --description "Login test"
 *
 * Output: JSON confirmation with recipe name and npm command.
 */
import 'dotenv/config';
import { saveRecipe, listRecipes } from './recipe.js';

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { name: null, steps: null, description: '' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--steps' && args[i + 1]) opts.steps = args[++i];
    else if (args[i] === '--description' && args[i + 1]) opts.description = args[++i];
    else if (args[i] === '--list') { opts.list = true; }
    else if (!opts.name && !args[i].startsWith('--')) opts.name = args[i];
  }

  return opts;
}

async function run() {
  const opts = parseArgs();

  // List mode
  if (opts.list) {
    const recipes = await listRecipes();
    console.log(JSON.stringify({ recipes }, null, 2));
    return;
  }

  if (!opts.name) {
    console.error(JSON.stringify({
      error: 'Recipe name required.',
      usage: 'node src/save-recipe.js <name> --steps \'[...]\'',
    }));
    process.exit(1);
  }

  let stepsJson = opts.steps;
  if (!stepsJson) {
    stepsJson = await readStdin();
  }

  if (!stepsJson) {
    console.error(JSON.stringify({
      error: 'No steps provided. Pass via --steps or pipe JSON to stdin.',
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

  try {
    const { safeName, recipePath } = await saveRecipe(opts.name, {
      steps,
      source: '',
      description: opts.description || `QA test: ${opts.name}`,
      config: {
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 800,
        timeout: 30000,
      },
    });

    console.log(JSON.stringify({
      success: true,
      recipeName: safeName,
      recipePath,
      runCommand: `npm run test:${safeName}`,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

run();
