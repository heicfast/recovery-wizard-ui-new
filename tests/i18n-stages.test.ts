import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { zhCN } from '@/i18n/zh-CN';
import { SCAN_STAGE_I18N_KEYS } from '@/i18n';

/**
 * Regression guard for the stage-label leak: the scan status strip once
 * rendered the raw key `scan.stage.volume-analysis` because the component
 * built keys with a dot-joined pattern while resources use camelCase keys.
 * Every contract ScanStage must resolve to real copy in BOTH locales, and
 * the resolved copy must never leak a `.`-joined key.
 */

/** Resolves a dotted i18n path inside a flat-ish resource object. */
function resolve(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, seg) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[seg];
    }
    return undefined;
  }, obj);
}

describe('i18n resource integrity (stage keys)', () => {
  const locales: ReadonlyArray<[string, unknown]> = [
    ['en', en],
    ['zh-CN', zhCN],
  ];

  for (const [locale, resource] of locales) {
    it(`resolves every ScanStage label in ${locale}`, () => {
      for (const key of Object.values(SCAN_STAGE_I18N_KEYS)) {
        const value = resolve(resource, key);
        expect(value, `${locale} missing ${key}`).toEqual(expect.any(String));
        expect(String(value).length).toBeGreaterThan(1);
      }
    });
  }

  it('never leaks a dot-joined scan stage key', () => {
    // If someone re-introduces `scan.stage.<slug>` keys, this catches it:
    const scan = resolve(en, 'scan') as Record<string, unknown>;
    expect(Object.keys(scan).some((k) => k.includes('-'))).toBe(false);
  });
});
