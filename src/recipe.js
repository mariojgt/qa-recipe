import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const RECIPES_DIR = path.join(ROOT_DIR, 'recipes');
const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'screenshots');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function saveRecipe(name, { steps, source, config, description }) {
  const safeName = sanitizeName(name);
  if (!safeName) {
    throw new Error('Invalid recipe name. Use letters, numbers, and hyphens.');
  }

  await fs.mkdir(RECIPES_DIR, { recursive: true });

  const recipe = {
    name: safeName,
    description: description || `QA test: ${safeName}`,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: source || '',
    config: config || {
      headless: true,
      viewportWidth: 1280,
      viewportHeight: 800,
      timeout: 30000,
    },
    steps,
  };

  const recipePath = path.join(RECIPES_DIR, `${safeName}.json`);
  await fs.writeFile(recipePath, JSON.stringify(recipe, null, 2), 'utf-8');

  // Register npm script in package.json
  const pkgRaw = await fs.readFile(PACKAGE_JSON_PATH, 'utf-8');
  const pkg = JSON.parse(pkgRaw);
  pkg.scripts[`test:${safeName}`] = `node src/runner.js ${safeName}`;
  await fs.writeFile(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  return { safeName, recipePath };
}

export async function loadRecipe(name) {
  const safeName = sanitizeName(name);
  const recipePath = path.join(RECIPES_DIR, `${safeName}.json`);

  try {
    const raw = await fs.readFile(recipePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const available = await listRecipes();
      const list = available.length > 0 ? available.join(', ') : 'none';
      throw new Error(`Recipe "${safeName}" not found. Available recipes: ${list}`);
    }
    throw err;
  }
}

export async function listRecipes() {
  try {
    const files = await fs.readdir(RECIPES_DIR);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export function getScreenshotDir(recipeName, runId) {
  const id = runId || new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(SCREENSHOTS_DIR, recipeName || '_interactive', id);
}
