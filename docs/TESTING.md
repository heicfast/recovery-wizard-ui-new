# TESTING

## Layers

| Layer        | Tool                                      | Scope                                                                                |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Unit         | Vitest 4.1.12                             | formatters, RNG determinism, stores, node-space index                                |
| Contract     | Vitest                                    | mock connector lifecycle/timing/injections, tauri stub behavior                      |
| Component    | Vitest + Testing Library                  | theme provider, primitives a11y (progressbar roles, labels), state components        |
| UI smoke     | Playwright 1.64.1 (`e2e/smoke.spec.ts`)   | golden path incl. destination dialog, console-error assertions |
| Acceptance   | Playwright (`e2e/acceptance.spec.ts`)    | axe WCAG 2.0/2.1 A+AA per surface × theme (21 audits), DPI ladder 100–200 %, scroll-frame budget, zh-CN + long-string stress, frontend cold-load |
| Architecture | arch-lint + ast-grep + eslint zones       | connector boundary, no raw invoke, feature isolation                                 |
| Static       | tsc --noEmit, prettier, knip, jscpd       | types, style, dead code, duplication                                                 |
| Rust         | cargo check + clippy (CI, windows-latest) | shell compiles clean                                                                 |

## Running locally

```
pnpm test              # unit + contract + component (59 tests)
pnpm test:coverage     # with v8 coverage
pnpm e2e               # Playwright smoke (builds nothing; serves `dist` via preview)
pnpm typecheck && pnpm lint && pnpm arch:lint && pnpm bundle:check
```

## Key guarantees asserted by tests

- **Determinism**: identical seeds produce identical device lists, pages,
  preview payloads, and recovery outcomes.
- **Timing budgets** (mock contract): pause/resume < 600 ms, cancel ≤ 300 ms,
  filter query < 200 ms on the standard scenario (grid #36).
- **Monotonicity**: overall scan progress never regresses across a full run.
- **One-shot disconnect injection**: fires once; resume (the reconnect
  acknowledgment) restores `deviceConnected` and continues.
- **Hard overlap refusal**: `validateDestination` rejects same-volume
  destinations with `reason: 'overlap'`.
- **Repair consent**: `applyRepair` without the `REPAIR` token throws
  `repair-consent-required`; the undo log round-trips.
- **Stub truthfulness**: every tauri-adapter method throws
  `not-implemented` pointing at CONNECTOR-CONTRACT.md.

## Accessibility testing

- Component tests assert `role="progressbar"` + aria-value attributes on
  the gauge and capacity bars, labeled checkboxes, and badge labeling
  (color never the only signal).
- Playwright drives the full path via accessible roles/names only — the
  smoke suite doubles as a keyboard/AT operability check.
- `@axe-core/playwright` audits every stable surface in light, dark and
  high-contrast; serious/critical findings fail CI (session 2: 0 across 21
  audits — the audit itself found and drove the fixes in VISUAL-ACCEPTANCE).
- `tests/i18n-stages.test.ts` guards resource integrity for the ScanStage
  labels in both locales (regression test for the raw-key leak).

## CI matrix

- `ci.yml` (windows-latest): frozen install → typecheck → lint → format →
  arch (3 layers) → knip → jscpd → vitest → build → bundle budget →
  cargo check + clippy → artifact upload.
- `ui-smoke.yml`: preview-server Playwright run (smoke + acceptance suite)
  + screenshot corpus upload + reports; a secondary job proves the Tauri
  debug bundle links (`tauri build --debug --no-bundle`) — hard-gated, no
  `continue-on-error` masking.
- `release.yml` (tag `v*`): version match gate, NSIS bundle, SHA-256,
  unsigned-artifact disclosure in release notes.

## Live verification evidence (this session)

Eight step screenshots under the session workspace (`verify-01..08`):
home, scan config, completion modal, results 3-pane, filter bar open,
preview pane populated, destination dialog, recovery report — full golden
path with **0 page errors** and no console errors (React DevTools notice
filtered as benign). Two real defects were caught and fixed during this
pass (see worklog): the row-checkbox double-toggle and a Radix
RadioGroupItem context misuse that the error boundary surfaced.
