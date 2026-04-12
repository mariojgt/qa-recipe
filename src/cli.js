#!/usr/bin/env node
/**
 * QA Recipe - Interactive CLI
 *
 * Lists all recipes from the recipes/ folder and lets you pick one to run.
 *
 * Usage:
 *   node src/cli.js
 *   bun run recipe
 *   npm run recipe
 */
import { listRecipes, loadRecipe } from './recipe.js';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const recipes = await listRecipes();

  if (recipes.length === 0) {
    console.log(yellow('\n  No recipes found in recipes/ folder.\n'));
    console.log(dim('  Create one with: npm run save <name> --steps \'[...]\''));
    process.exit(0);
  }

  console.log('');
  console.log(bold('  QA Recipe Runner'));
  console.log(dim('  ─────────────────────────────────────'));
  console.log('');

  // Load details for each recipe
  const details = await Promise.all(
    recipes.map(async (name) => {
      try {
        const recipe = await loadRecipe(name);
        return { name, description: recipe.description, steps: recipe.steps.length };
      } catch {
        return { name, description: '(could not load)', steps: 0 };
      }
    })
  );

  for (let i = 0; i < details.length; i++) {
    const r = details[i];
    const num = cyan(`  [${i + 1}]`);
    const label = bold(r.name);
    const desc = dim(r.description);
    const stepCount = dim(`(${r.steps} steps)`);
    console.log(`${num} ${label} ${stepCount}`);
    console.log(`      ${desc}`);
  }

  console.log('');
  console.log(dim('  [0] Exit'));
  console.log('');

  const answer = await prompt(`  ${green('>')} Select a recipe (1-${details.length}): `);
  const choice = parseInt(answer, 10);

  if (isNaN(choice) || choice === 0) {
    console.log(dim('\n  Bye!\n'));
    process.exit(0);
  }

  if (choice < 1 || choice > details.length) {
    console.log(yellow('\n  Invalid choice.\n'));
    process.exit(1);
  }

  const selected = details[choice - 1];
  console.log('');
  console.log(dim(`  Running ${bold(selected.name)}...`));
  console.log('');

  // Spawn the runner as a child process so its output streams directly
  const runnerPath = path.join(__dirname, 'runner.js');
  const child = spawn(process.execPath, [runnerPath, selected.name], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main();
