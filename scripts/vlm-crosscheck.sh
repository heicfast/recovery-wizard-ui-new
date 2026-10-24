#!/usr/bin/env bash
# Cross-check: built UI screenshots vs reference corpus screenshots (VLM).
# Usage: bash scripts/vlm-crosscheck.sh  (outputs to scripts/vlm-crosscheck/)
set -u
OUT=scripts/vlm-crosscheck
mkdir -p "$OUT"
CORPUS=/home/z/my-project/corpus/re-workspace/raw-evidence/ui-screenshots
OURS=test-results/acceptance

declare -a PAIRS=(
  "home|light-01-home.png|02-landing/landing-baseline-v2.png"
  "scan-live|light-03-scan-live.png|03-scan-phase/scan-midscan-21pct.png"
  "complete|light-04-scan-complete.png|04-scan-complete/complete-celebration-modal.png"
  "results|light-05-results.png|05-results/results-baseline.png"
  "destination|light-06-recovery-destination.png|07-recovery/recovery-destination-dialog-clean.png"
  "results-zh|light-13-results-zh.png|05-results/results-context-menu-open.png"
)

for entry in "${PAIRS[@]}"; do
  IFS='|' read -r name ours ref <<< "$entry"
  echo "=== $name: ours=$ours ref=$ref"
  z-ai vision \
    -p "Image 1 is a reference product screenshot; Image 2 is a clean-room re-implementation of the same surface. Compare ONLY these dimensions and rate each MATCH or DIFF with one short line of evidence: (1) overall layout structure (zones, panes, columns, sidebar); (2) information architecture (what controls and data appear where); (3) color palette family (blues/neutrals, light theme); (4) typography scale (title vs body vs meta); (5) control geometry (card sizes, button prominence, list density); (6) primary CTA placement. Known intentional divergences you must NOT flag: different branding/logo, different language strings, different device/file names, presence/absence of AI-assistant or upsell widgets. End with VERDICT: STRUCTURALLY_EQUIVALENT or STRUCTURALLY_DIVERGENT plus one sentence." \
    -i "$CORPUS/$ref" \
    -i "$OURS/$ours" \
    -o "$OUT/$name.json" 2>/dev/null || echo "  (VLM call failed for $name)"
  python3 -c "
import json,sys
try:
  d=json.load(open('$OUT/$name.json'))
  c=d.get('choices',[{}])[0].get('message',{}).get('content','')
  print(c[:1200])
except Exception as e:
  print('  parse error:', e)
"
  echo
done
