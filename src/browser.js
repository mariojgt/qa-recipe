import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

export async function launchBrowser(config = {}) {
  const headless = config.headless ?? (process.env.HEADLESS !== 'false');
  const width = config.viewportWidth ?? (parseInt(process.env.DEFAULT_VIEWPORT_WIDTH) || 1280);
  const height = config.viewportHeight ?? (parseInt(process.env.DEFAULT_VIEWPORT_HEIGHT) || 800);

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    defaultViewport: { width, height },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const timeout = config.timeout ?? (parseInt(process.env.DEFAULT_TIMEOUT) || 30000);
  page.setDefaultTimeout(timeout);

  return { browser, page };
}

export async function executeStep(page, step, stepIndex, screenshotDir) {
  const startTime = Date.now();
  const result = {
    stepIndex,
    action: step.action,
    description: step.description,
    success: false,
    error: null,
    screenshotPath: null,
    duration: 0,
  };

  try {
    switch (step.action) {
      case 'navigate':
        await page.goto(step.value, { waitUntil: 'networkidle2' });
        break;

      case 'click':
        await page.waitForSelector(step.selector);
        await page.click(step.selector);
        await sleep(500);
        break;

      case 'type':
        await page.waitForSelector(step.selector);
        await page.click(step.selector, { clickCount: 3 });
        await page.type(step.selector, step.value, { delay: 30 });
        break;

      case 'select':
        await page.waitForSelector(step.selector);
        await page.select(step.selector, step.value);
        break;

      case 'hover':
        await page.waitForSelector(step.selector);
        await page.hover(step.selector);
        break;

      case 'scroll':
        await page.evaluate((pixels) => {
          window.scrollBy(0, parseInt(pixels) || 300);
        }, step.value || '300');
        break;

      case 'wait':
        await sleep(parseInt(step.value) || 1000);
        break;

      case 'screenshot':
        // Handled below
        break;

      case 'assert_url': {
        const currentUrl = page.url();
        if (!currentUrl.includes(step.value)) {
          throw new Error(`URL "${currentUrl}" does not contain "${step.value}"`);
        }
        break;
      }

      case 'assert_text':
        await page.waitForFunction(
          (text) => document.body.innerText.includes(text),
          { timeout: page.getDefaultTimeout() },
          step.value
        );
        break;

      case 'assert_element':
        await page.waitForSelector(step.selector);
        break;

      case 'type_in_iframe': {
        // Type into an input inside an iframe.
        // step.iframeSelector = CSS selector for the iframe on the page, OR
        // step.iframeUrlMatch = substring to match against frame URLs
        // step.iframeInputSelector = CSS selector for the input INSIDE the iframe (defaults to 'input')
        const inputSel = step.iframeInputSelector || 'input';
        let frame;

        if (step.iframeUrlMatch) {
          // Find frame by URL match
          frame = page.frames().find(f => f.url().includes(step.iframeUrlMatch));
          if (!frame) throw new Error(`No iframe found with URL containing: ${step.iframeUrlMatch}`);
        } else {
          const iframeSel = step.iframeSelector || step.selector;
          await page.waitForSelector(iframeSel);
          const frameHandle = await page.$(iframeSel);
          frame = await frameHandle.contentFrame();
          if (!frame) throw new Error(`Could not access iframe content: ${iframeSel}`);
        }

        await frame.waitForSelector(inputSel, { timeout: 10000 });
        await frame.click(inputSel);
        await frame.type(inputSel, step.value, { delay: 50 });
        break;
      }

      case 'evaluate':
        // Run arbitrary JS on the page. step.value = JS code string (will be wrapped in an async function)
        await page.evaluate(step.value);
        break;

      case 'click_text': {
        // Click an element containing specific text
        const textToFind = step.value;
        const elSelector = step.selector || '*';
        await page.evaluate((sel, txt) => {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            if (el.textContent.trim().includes(txt)) {
              el.click();
              return;
            }
          }
          throw new Error(`No element matching "${sel}" with text "${txt}"`);
        }, elSelector, textToFind);
        await sleep(500);
        break;
      }

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }

    result.success = true;

    if (step.screenshot !== false && screenshotDir) {
      result.screenshotPath = await takeScreenshot(page, screenshotDir, stepIndex, step.action);
    }
  } catch (err) {
    result.error = err.message;

    if (screenshotDir) {
      try {
        result.screenshotPath = await takeScreenshot(page, screenshotDir, stepIndex, step.action, true);
      } catch {
        // Can't take error screenshot, ignore
      }
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function takeScreenshot(page, dir, stepIndex, action, isError = false) {
  await fs.mkdir(dir, { recursive: true });
  const prefix = isError ? 'error-' : '';
  const filename = `${prefix}step-${String(stepIndex + 1).padStart(3, '0')}-${action}-${Date.now()}.png`;
  const filepath = path.join(dir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

export async function closeBrowser(browser) {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Browser may already be closed
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
