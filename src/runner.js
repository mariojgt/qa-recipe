import 'dotenv/config';
import { loadRecipe, getScreenshotDir } from './recipe.js';
import { launchBrowser, executeStep, closeBrowser } from './browser.js';
import { resolveVariables } from './variables.js';

// ANSI colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function run() {
  const recipeName = process.argv[2];
  if (!recipeName) {
    console.error(red('Usage: node src/runner.js <recipe-name>'));
    console.error(dim('  Example: node src/runner.js login-flow'));
    process.exit(1);
  }

  let browser;
  try {
    const recipe = await loadRecipe(recipeName);
    recipe.steps = resolveVariables(recipe.steps);
    const screenshotDir = getScreenshotDir(recipe.name);
    const total = recipe.steps.length;

    console.log('');
    console.log(bold(`=== QA Recipe: ${recipe.name} ===`));
    console.log(dim(`  ${recipe.description}`));
    console.log(dim(`  ${total} steps | screenshots: ${screenshotDir}`));
    console.log('');

    const { browser: b, page } = await launchBrowser(recipe.config);
    browser = b;

    const results = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      const label = `Step ${i + 1}/${total}`;
      process.stdout.write(`  ${label}: [${step.action}] ${step.description} `);

      const result = await executeStep(page, step, i, screenshotDir);
      results.push(result);

      if (result.success) {
        passed++;
        console.log(green('PASS') + dim(` (${result.duration}ms)`));
      } else {
        failed++;
        console.log(red('FAIL'));
        console.log(red(`    Error: ${result.error}`));
        if (result.screenshotPath) {
          console.log(dim(`    Screenshot: ${result.screenshotPath}`));
        }
      }
    }

    console.log('');
    console.log(bold('=== Results ==='));
    if (failed === 0) {
      console.log(green(`  All ${passed} steps passed`));
    } else {
      console.log(yellow(`  ${passed}/${total} passed, ${red(`${failed} failed`)}`));
    }
    console.log(dim(`  Screenshots: ${screenshotDir}`));
    console.log('');

    await closeBrowser(browser);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(red(`\nError: ${err.message}`));
    await closeBrowser(browser);
    process.exit(1);
  }
}

run();
