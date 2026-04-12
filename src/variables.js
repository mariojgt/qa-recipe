import crypto from 'crypto';

/**
 * Built-in template variables resolved fresh on each run.
 * Use {{variableName}} in recipe step values/selectors.
 */
function generateVariables() {
  const ts = Date.now();
  const hex = crypto.randomBytes(4).toString('hex');

  return {
    timestamp: String(ts),
    randomEmail: `qa.tester+${ts}@test-example.dev`,
    randomPassword: `QaT3st!${hex}${ts}`,
    randomName: `QA Tester ${hex}`,
    randomPhone: `555${String(ts).slice(-7)}`,
    randomHex: hex,
  };
}

/**
 * Replace all {{varName}} placeholders in step string fields.
 * Returns a new array of steps with variables resolved.
 */
export function resolveVariables(steps) {
  const vars = generateVariables();
  const pattern = /\{\{(\w+)\}\}/g;

  return steps.map((step) => {
    const resolved = { ...step };
    for (const key of ['value', 'selector', 'iframeInputSelector', 'iframeUrlMatch']) {
      if (typeof resolved[key] === 'string') {
        resolved[key] = resolved[key].replace(pattern, (_, name) => vars[name] ?? `{{${name}}}`);
      }
    }
    return resolved;
  });
}
