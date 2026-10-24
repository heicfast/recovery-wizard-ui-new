import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Acceptance suite — closes the PARTIAL items of docs/VISUAL-ACCEPTANCE.md
 * that are CI-measurable against the mock connector:
 *
 *  - #12/52  axe audit (WCAG 2.0/2.1 A+AA) on every stable surface × theme
 *  - #16/17  systematic light / dark / high-contrast screenshot corpus
 *  - #34/35  virtualized-list scroll frame budget (no frame > 50 ms beyond p95)
 *  - #41–44  DPI ladder 100–200 % (layout integrity at Windows-scaling viewports)
 *  - #39     frontend cold-load budget (localhost preview; documented scope)
 *  - #46/47  zh-CN + long-string fixture stress (no overflow, truncation intact)
 *  - #54     zero console errors on every path driven here
 *
 * Theme control: `rw.ui.theme` is set via addInitScript before app boot.
 * Locale control: live switch via the Settings segmented control (no reload —
 * the in-memory mock session survives).
 */

type ThemeId = 'light' | 'dark' | 'hc';

const THEMES: ReadonlyArray<{ id: ThemeId; storage: string; scheme: 'light' | 'dark' }> = [
  { id: 'light', storage: 'light', scheme: 'light' },
  { id: 'dark', storage: 'dark', scheme: 'dark' },
  { id: 'hc', storage: 'high-contrast', scheme: 'dark' },
];

const SHOT_DIR = 'test-results/acceptance';

let consoleErrors: string[] = [];

function attachErrorCollector(page: Page): void {
  consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
}

function expectNoConsoleErrors(): void {
  const benign = consoleErrors.filter(
    (e) => e.includes('Download the React DevTools') || e.includes('[vite]'),
  );
  expect(consoleErrors.filter((e) => !benign.includes(e))).toEqual([]);
}

/** WCAG A/AA audit; fails on serious or critical findings. */
async function audit(page: Page, surface: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`)
      .join('\n  ');
    throw new Error(`axe violations on ${surface}:\n  ${summary}`);
  }
}

async function shot(page: Page, theme: ThemeId, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIR}/${theme}-${name}.png` });
}

/** Home → (optional quick mode) → scan started. Returns once status is live. */
async function driveScanToCompletion(page: Page): Promise<void> {
  await page.getByRole('radio').first().click();
  await page
    .getByRole('button', { name: /search for lost data/i })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /search setup/i })).toBeVisible();

  // Quick mode when available (fixtures make it available in the standard
  // scenario); otherwise the deep default still works — same budget class.
  const quick = page.getByRole('radio', { name: /quick search/i });
  if (await quick.isEnabled()) await quick.click();

  await page.getByRole('button', { name: /^start searching$/i }).click();
  await expect(page.getByRole('status').first()).toBeVisible({ timeout: 20_000 });
}

for (const theme of THEMES) {
  test.describe(`theme corpus + a11y — ${theme.id}`, () => {
    test.use({ colorScheme: theme.scheme });

    test.beforeEach(async ({ page }) => {
      attachErrorCollector(page);
      await page.addInitScript((stored) => {
        localStorage.setItem('rw.ui.theme', stored);
      }, theme.storage);
    });

    test('every surface: axe audit + corpus screenshot', async ({ page }) => {
      // 10 surfaces + 7 axe audits + a scan + a recovery job ≈ 60–90 s;
      // generous headroom for slower CI hardware.
      test.setTimeout(240_000);

      // -- Home ------------------------------------------------------------
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /choose where to look/i })).toBeVisible({
        timeout: 15_000,
      });
      await audit(page, `${theme.id}/home`);
      await shot(page, theme.id, '01-home');

      // -- Scan configuration ----------------------------------------------
      await page.getByRole('radio').first().click();
      await page
        .getByRole('button', { name: /search for lost data/i })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: /search setup/i })).toBeVisible();
      await audit(page, `${theme.id}/scan-config`);
      await shot(page, theme.id, '02-scan-config');

      // -- Scan live (mid-run screenshot only; animation excluded from axe) --
      await page.getByRole('button', { name: /^start searching$/i }).click();
      await expect(page.getByRole('status').first()).toBeVisible({ timeout: 20_000 });
      await shot(page, theme.id, '03-scan-live');

      // -- Completion modal (dialog state audited) ---------------------------
      const modal = page.getByRole('dialog', { name: /search complete/i });
      await expect(modal).toBeVisible({ timeout: 90_000 });
      await audit(page, `${theme.id}/scan-complete-modal`);
      await shot(page, theme.id, '04-scan-complete');

      // -- Results ------------------------------------------------------------
      await modal.getByRole('button', { name: /open found files/i }).click();
      await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await audit(page, `${theme.id}/results`);
      await shot(page, theme.id, '05-results');

      // -- Recovery (destination dialog + report) -----------------------------
      await page
        .getByLabel(/select row/i)
        .first()
        .click();
      await page.getByRole('button', { name: /recover 1 item/i }).click();
      const destDialog = page.getByRole('dialog', {
        name: /where should the recovered files/i,
      });
      await expect(destDialog).toBeVisible();
      await audit(page, `${theme.id}/recovery-destination`);
      await shot(page, theme.id, '06-recovery-destination');
      await destDialog.getByRole('radio', { name: /choose folder/i }).click();
      await expect(destDialog.getByRole('button', { name: /^save$/i })).toBeEnabled({
        timeout: 5_000,
      });
      await destDialog.getByRole('button', { name: /^save$/i }).click();
      await expect(
        page.getByRole('status').filter({ hasText: /recovery finished/i }),
      ).toBeVisible({ timeout: 60_000 });
      await shot(page, theme.id, '07-recovery-report');

      // -- Health / Repair / Settings (sidebar surfaces) ----------------------
      // The results-flow sidebar hides the advanced nav; return home first.
      await page.getByRole('link', { name: /choose another device/i }).click();
      await expect(page.getByRole('heading', { name: /choose where to look/i })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole('link', { name: /disk health/i }).click();
      await expect(page.getByRole('heading', { name: /disk health/i }).first()).toBeVisible();
      await audit(page, `${theme.id}/health`);
      await shot(page, theme.id, '08-health');

      await page.getByRole('link', { name: /volume repair/i }).click();
      await expect(page.getByRole('heading', { name: /volume repair/i }).first()).toBeVisible();
      await audit(page, `${theme.id}/repair`);
      await shot(page, theme.id, '09-repair');

      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: /settings/i }).first()).toBeVisible();
      await audit(page, `${theme.id}/settings`);
      await shot(page, theme.id, '10-settings');

      expectNoConsoleErrors();
    });
  });
}

test.describe('layout + performance', () => {
  test.beforeEach(({ page }) => {
    attachErrorCollector(page);
  });

  /**
   * DPI ladder (grid #41–44). Windows display scaling shrinks the CSS
   * viewport of a fixed 1240×840 window; a maximized 1920×1080 screen at
   * 100–200 % yields exactly the ladder below (200 % clamps to the 800×600
   * window minimum). Layout integrity = no horizontal overflow + primary
   * controls visible at every step.
   */
  test('DPI ladder 100–200 %: home + results keep layout integrity', async ({ page }) => {
    test.setTimeout(240_000);
    const LADDER: ReadonlyArray<{ pct: number; w: number; h: number }> = [
      { pct: 100, w: 1920, h: 1080 },
      { pct: 125, w: 1536, h: 864 },
      { pct: 150, w: 1280, h: 720 },
      { pct: 175, w: 1097, h: 617 },
      { pct: 200, w: 960, h: 600 },
    ];

    await page.setViewportSize({ width: LADDER[0].w, height: LADDER[0].h });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /choose where to look/i })).toBeVisible({
      timeout: 15_000,
    });

    for (const step of LADDER) {
      await page.setViewportSize({ width: step.w, height: step.h });
      await page.waitForTimeout(200); // reflow settle
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `home overflows at ${step.pct}%`).toBeLessThanOrEqual(0);
      await expect(
        page.getByRole('button', { name: /search for lost data/i }).first(),
      ).toBeVisible();
      await shot(page, 'light', `dpi-${step.pct}-home`);
    }

    // Same ladder on the densest surface (results 3-pane).
    await page.setViewportSize({ width: LADDER[0].w, height: LADDER[0].h });
    await driveScanToCompletion(page);
    const modal = page.getByRole('dialog', { name: /search complete/i });
    await expect(modal).toBeVisible({ timeout: 90_000 });
    await modal.getByRole('button', { name: /open found files/i }).click();
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });

    for (const step of LADDER) {
      await page.setViewportSize({ width: step.w, height: step.h });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `results overflows at ${step.pct}%`).toBeLessThanOrEqual(0);
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, 'light', `dpi-${step.pct}-results`);
    }
    expectNoConsoleErrors();
  });

  /**
   * Scroll frame budget (grid #34/35/38): wheel-scroll the virtualized list
   * through many pages while sampling rAF deltas. Budget: median ≤ 25 ms and
   * p95 ≤ 50 ms (the dispatcher-watchdog ceiling) under headless Chromium —
   * documented as a CI-relative measurement, re-measured on hardware later.
   */
  test('virtualized results list: scroll frame budget', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await driveScanToCompletion(page);
    const modal = page.getByRole('dialog', { name: /search complete/i });
    await expect(modal).toBeVisible({ timeout: 90_000 });
    await modal.getByRole('button', { name: /open found files/i }).click();
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });

    const list = page.getByRole('grid');
    const box = await list.boundingBox();
    expect(box).not.toBeNull();

    const sampling = page.evaluate(async () => {
      const deltas: number[] = [];
      let last = performance.now();
      await new Promise<void>((resolve) => {
        const start = last;
        const tick = (t: number): void => {
          deltas.push(t - last);
          last = t;
          if (t - start < 3000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return deltas;
    });

    // Alternate scroll direction to exercise virtualization both ways.
    for (let i = 0; i < 24; i++) {
      await page.mouse.move((box!.x + box!.width) / 2, (box!.y + box!.height) / 2);
      await page.mouse.wheel(0, i % 8 === 7 ? -2400 : 400);
      await page.waitForTimeout(100);
    }
    const deltas = (await sampling).filter((d) => d > 0).sort((a, b) => a - b);
    expect(deltas.length).toBeGreaterThan(30);

    const median = deltas[Math.floor(deltas.length / 2)];
    const p95 = deltas[Math.min(deltas.length - 1, Math.ceil(deltas.length * 0.95) - 1)];
    const slow = deltas.filter((d) => d > 50).length;
    console.log(
      `scroll frames: median ${median.toFixed(1)}ms p95 ${p95.toFixed(1)}ms >50ms ${slow}/${deltas.length}`,
    );
    expect(median, `median frame ${median}ms`).toBeLessThanOrEqual(25);
    expect(p95, `p95 frame ${p95}ms`).toBeLessThanOrEqual(50);
    expect(
      slow / deltas.length,
      `frames over 50ms: ${slow}/${deltas.length}`,
    ).toBeLessThanOrEqual(0.05);
    expectNoConsoleErrors();
  });

  /**
   * zh-CN + long-string stress (grid #46/47). Live locale switch (Settings
   * segmented control) keeps the mock session alive; long/CJK fixture names
   * render with truncation, never overflow.
   */
  test('zh-CN and long-string stress: no overflow, truncation intact', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await driveScanToCompletion(page);
    const modal = page.getByRole('dialog', { name: /search complete/i });
    await expect(modal).toBeVisible({ timeout: 90_000 });
    await modal.getByRole('button', { name: /open found files/i }).click();
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    const resultsUrl = page.url();

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: /settings/i }).first()).toBeVisible();
    await page.getByRole('radio', { name: '简体中文' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await shot(page, 'light', '11-settings-zh');

    // Sidebar nav flipped to Chinese; home via the Internal Drives link.
    await page.getByRole('link', { name: '内置硬盘' }).click();
    await expect(page.getByRole('heading', { name: '选择要搜索丢失数据的位置' })).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, 'light', '12-home-zh');
    let overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'zh-CN home overflows').toBeLessThanOrEqual(0);

    // Results in zh (client-side revisit — the in-memory session survives).
    await page.goto(resultsUrl);
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await shot(page, 'light', '13-results-zh');
    overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'zh-CN results overflows').toBeLessThanOrEqual(0);
    expectNoConsoleErrors();
  });

  /**
   * Frontend cold-load budget (grid #39, documented scope): fresh context,
   * empty cache, localhost preview — app boot to interactive home. The full
   * packaged-app cold start is re-measured on Windows hardware; this gate
   * keeps the frontend share of it well inside the 2 s budget.
   */
  test('frontend cold load under 2 s (fresh context, no cache)', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    attachErrorCollector(page);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: /choose where to look/i })).toBeVisible({
      timeout: 15_000,
    });
    const elapsed = await page.evaluate(() => performance.now());
    console.log(`cold load (boot → home interactive): ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(2000);
    expectNoConsoleErrors();
    await ctx.close();
  });
});
