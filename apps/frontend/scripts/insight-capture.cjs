#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { chromium } = require('playwright');

const INSIGHT_TEXT_PATTERN = /see insights and ads|see insights|view insights|insights/i;
const SWITCH_TEXT_PATTERN = /switch now|switch to page|switch into/i;

function parseArgs(argv) {
  const result = {
    postUrl: '',
    pageName: 'post',
    pageId: '',
    headless: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--post-url') {
      result.postUrl = String(argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (arg === '--page-name') {
      result.pageName = String(argv[index + 1] ?? 'post').trim() || 'post';
      index += 1;
      continue;
    }
    if (arg === '--page-id') {
      result.pageId = String(argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (arg === '--headless') {
      result.headless = true;
    }
  }

  return result;
}

function normalizePageId(rawPageId) {
  const normalized = String(rawPageId ?? '').trim().replace(/[^0-9]/g, '');
  return normalized.length >= 5 ? normalized : '';
}

function ensureValidUrl(postUrl) {
  let parsed;
  try {
    parsed = new URL(postUrl);
  } catch {
    throw new Error('Invalid --post-url value.');
  }

  if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) {
    throw new Error('URL must be on facebook.com');
  }

  return parsed.toString();
}

function slugify(input) {
  const normalized = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'post';
}

async function clickLocatorCandidates(candidates, maxEach = 8) {
  for (const candidate of candidates) {
    const count = await candidate.locator.count().catch(() => 0);
    if (count <= 0) {
      continue;
    }

    for (let index = 0; index < Math.min(count, maxEach); index += 1) {
      const target = candidate.locator.nth(index);
      const visible = await target.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ timeout: 8_000 }).catch(async () => {
        await target.click({ timeout: 8_000, force: true });
      });
      return `${candidate.label} #${index + 1}`;
    }
  }

  return null;
}

async function hasLoginGate(page) {
  const candidates = [
    page.getByRole('button', { name: /log in|login|sign in/i }),
    page.getByRole('link', { name: /log in|login|sign in/i }),
    page.locator('form').filter({ hasText: /facebook login|log in/i })
  ];

  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function isLikelyPageModeActive(page) {
  const signals = [
    page.getByText(/ads manager|meta business suite|professional dashboard/i).first(),
    page.locator('a[href*="/pages/"]').first()
  ];

  for (const signal of signals) {
    if (await signal.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function trySwitchUsingPageId(page, pageId, steps) {
  const switchProfileUrl = `https://www.facebook.com/profile.php?id=${pageId}`;
  steps.push(`Trying auto switch via Page ID ${pageId}.`);
  await page.goto(switchProfileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_200);

  const clicked = await clickLocatorCandidates([
    { label: 'Switch Button', locator: page.getByRole('button', { name: SWITCH_TEXT_PATTERN }) },
    { label: 'Switch Link', locator: page.getByRole('link', { name: SWITCH_TEXT_PATTERN }) },
    {
      label: 'Switch Generic',
      locator: page.locator('a, button, div[role="button"], span').filter({ hasText: SWITCH_TEXT_PATTERN })
    }
  ]);

  if (clicked) {
    steps.push(`Auto switch by Page ID succeeded (${clicked}).`);
    await page.waitForTimeout(3_500);
    return true;
  }

  if (await isLikelyPageModeActive(page)) {
    steps.push('Page mode appears active already after Page ID navigation.');
    return true;
  }

  steps.push('Auto switch by Page ID did not find a switch action.');
  return false;
}

async function trySwitch(page, steps) {
  const clicked = await clickLocatorCandidates([
    { label: 'Switch Button', locator: page.getByRole('button', { name: SWITCH_TEXT_PATTERN }) },
    { label: 'Switch Link', locator: page.getByRole('link', { name: SWITCH_TEXT_PATTERN }) },
    {
      label: 'Switch Generic',
      locator: page.locator('a, button, div[role="button"], span').filter({ hasText: SWITCH_TEXT_PATTERN })
    }
  ]);

  if (clicked) {
    steps.push(`Clicked switch action: ${clicked}`);
    await page.waitForTimeout(4_000);
    return true;
  }

  steps.push('No switch action was visible.');
  return false;
}

async function openInsights(page, steps) {
  const clickInsights = async () =>
    clickLocatorCandidates([
      { label: 'Insights Link', locator: page.getByRole('link', { name: INSIGHT_TEXT_PATTERN }) },
      { label: 'Insights Button', locator: page.getByRole('button', { name: INSIGHT_TEXT_PATTERN }) },
      { label: 'Insights Href', locator: page.locator('a[href*="insight" i]') },
      {
        label: 'Insights Generic',
        locator: page.locator('a, button, div[role="button"], span').filter({ hasText: INSIGHT_TEXT_PATTERN })
      }
    ]);

  let clicked = await clickInsights();
  if (!clicked) {
    await page.mouse.wheel(0, 1_200);
    await page.waitForTimeout(1_000);
    clicked = await clickInsights();
  }

  if (!clicked) {
    throw new Error('Could not find an Insights action on this post.');
  }

  steps.push(`Clicked insights action: ${clicked}`);
  await page.waitForTimeout(3_000);
}

async function waitForManualReady(page, message) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(message);
  await rl.question('Press Enter when the post page is ready (you can see the Insights action)...');
  rl.close();
  await page.waitForTimeout(1_000);
}

async function capturePanel(page, screenshotPath, steps) {
  const candidates = [
    page.locator('[role="dialog"]').last(),
    page.locator('[aria-label*="insights" i]').last(),
    page.locator('section').filter({ hasText: /who viewed your content|top countries|views|viewers/i }).first(),
    page.locator('div').filter({ hasText: /who viewed your content|top countries|views|viewers/i }).first()
  ];

  for (const candidate of candidates) {
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const box = await candidate.boundingBox();
    if (!box || box.width < 250 || box.height < 180) {
      continue;
    }

    await candidate.screenshot({ path: screenshotPath });
    steps.push('Saved insight-panel screenshot.');
    return false;
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  steps.push('Fallback: saved full-page screenshot.');
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.postUrl) {
    throw new Error('Usage: npm run insight:capture --workspace @bizgital-marketing-report/frontend -- --post-url <facebook-url> [--page-name "Coca-Cola (LA)"] [--page-id 10007979236020] [--headless]');
  }

  const postUrl = ensureValidUrl(args.postUrl);
  const pageId = normalizePageId(args.pageId);
const captureRoot = path.resolve(process.cwd(), '.insight-capture-local');
  const profileDir = path.resolve(captureRoot, 'playwright-profile');
  const screenshotDir = path.resolve(captureRoot, 'screenshots');

  await fsp.mkdir(profileDir, { recursive: true });
  await fsp.mkdir(screenshotDir, { recursive: true });

  const filePrefix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(args.pageName)}`;
  const screenshotPath = path.resolve(screenshotDir, `${filePrefix}-${Math.random().toString(16).slice(2, 8)}.png`);
  const debugPath = path.resolve(screenshotDir, `${filePrefix}-debug-${Math.random().toString(16).slice(2, 8)}.png`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: Boolean(args.headless),
    viewport: { width: 1680, height: 1900 }
  });

  const steps = [];
  try {
    const page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(25_000);
    page.setDefaultNavigationTimeout(45_000);

    steps.push(`Navigating to ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_200);

    if (await hasLoginGate(page)) {
      await waitForManualReady(
        page,
        'Login gate detected. Please sign in and switch into the target page on the opened browser window.'
      );
      await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2_500);
      steps.push('Continued after manual login confirmation.');
    }

    if (pageId) {
      const switchedByPageId = await trySwitchUsingPageId(page, pageId, steps);
      if (switchedByPageId) {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2_200);
        steps.push('Reloaded post after Page ID switch.');
      }
    }

    const switched = await trySwitch(page, steps);
    if (switched) {
      await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2_200);
      steps.push('Reloaded post after switching page.');
    }

    try {
      await openInsights(page, steps);
    } catch {
      if (!args.headless) {
        await waitForManualReady(
          page,
          'Insights action not found automatically. Please scroll/expand the post and make sure Insights is visible.'
        );
        await openInsights(page, steps);
      } else {
        throw new Error('Could not find an Insights action on this post.');
      }
    }
    const fallback = await capturePanel(page, screenshotPath, steps);

    console.log('\nCapture succeeded');
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Fallback full-page: ${fallback ? 'yes' : 'no'}`);
    console.log('Steps:');
    for (const step of steps) {
      console.log(`- ${step}`);
    }
  } catch (error) {
    const page = context.pages()[0] || null;
    if (page) {
      await page.screenshot({ path: debugPath, fullPage: true }).catch(() => undefined);
    }

    console.error('\nCapture failed');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    console.error(`Debug screenshot: ${debugPath}`);
    if (steps.length > 0) {
      console.error('Steps:');
      for (const step of steps) {
        console.error(`- ${step}`);
      }
    }
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
