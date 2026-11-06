# Review 2: implementation

## Target

Repository voxel, base `origin/main` at `cf1cb28807b5e0bf0fdd40ace78a51fb73643607`, target branch `hud-font` at `8ba2f25049117b2ce5b9b580b1772580114c53ae` (the bundled HUD font) plus the uncommitted working-tree change: the one-round-trip oak helpers in `tests/browser/oak-ecosystem-browser-support.ts` and the Linux verdict and helper lines in the defect register, this unit's plan and the devlog. The reviewers read the working tree's `git diff cf1cb28` appended to their prompt (48,675-byte prompt, SHA-256 `4390b75fa34a9ab0e65b2f17cf919430725c8b827082241ffb196d0b833f517c`). The uncommitted part was `git diff HEAD` of 11,273 bytes, SHA-256 `08a3176b6f788bbe5c837872377dc30ce28eff5d1cb58384f5a20b9f7bb56ea9`, and it was committed unchanged as `7812f99` (the Linux verdict records) and `9713894` (the helper), whose combined diff from `8ba2f25` is those bytes.

The fixes made after this round, listed under "Findings and disposition", were not reviewed.

## Reviewers and coverage

Both lanes ran from the ignored run folder `fleet/tmp/review-runs/voxel-5-r2-font`, with the reviewed tree as their working folder, on the runbook's prompt: the change, the owner's evidence, seven questions and the diff. A full `npm run verify` ran in the tree at the same time, writing only ignored folders. No tracked or source file in the tree changed between 22:42:00 and 23:03:30Z, which covers both lanes.

- Codex CLI 0.163.0, `gpt-6-astra`, `model_reasoning_effort=xhigh`, `--sandbox read-only --ephemeral`, 2026-11-06 22:42:01 to 22:44:51Z. The runbook's check printed `keep` (0 failed commands), and its log never names the run folder. Spot-checked citations outside the diff: `package.json:19` (the `files` allowlist) and `fixtures/oak-ecosystem-consumer/oak-browser-host.ts:405` (the dispose path) hold. It did not delegate.
- Claude Code 2.1.308, `claude-opus-5-5[1m]`, `--effort max`, tools `Read,Glob,Grep,Task,Bash`, `--permission-mode dontAsk`, no settings, no MCP servers, 2026-11-06 22:42:01 to 23:03:23Z. The `system/init` event named the pin, those five tools, `dontAsk` and no MCP servers. The report command printed `keep success claude-opus-5-5[1m]`, and stderr was empty. It made 76 tool calls, all reads (34 Read, 17 Grep, 7 Glob, 18 Bash), the permission rules refused 7, and none touched the run folder. It did not delegate.

## Reports

### Codex (gpt-6-astra, xhigh)

SHIP

- F1 [nit] [docs/architecture/supply-chain.md:49](/C:/Users/38909/Documents/worktrees/voxel-hudfont/docs/architecture/supply-chain.md:49) - The new paragraph correctly says the font is recorded manually, but the introduction at lines 5–8 still says every figure comes from `test:supply-chain` and nothing is asserted by hand. Scope that introduction to the automated package checks. Also remove hard wrapping from the new paragraph to follow the repository’s writing rule.
- F2 [nit] [tests/browser/oak-ecosystem-font.spec.ts:21](/C:/Users/38909/Documents/worktrees/voxel-hudfont/tests/browser/oak-ecosystem-font.spec.ts:21) - “Until 2026-09-22” conflicts with the CSS comment and November repair record. Distinguish the September investigation from the November implementation.

**Verified myself**

Read the live instructions, policies, diff, helper callers, harness implementation, and installed Playwright implementation. HEAD matches `8ba2f25049117b2ce5b9b580b1772580114c53ae`; the working changes match the supplied scope. `git diff --check` passed. No files were changed and no tests, builds, installs, browsers, or network requests were run.

The vendored file’s SHA-256 matches the supplied hash. `OFL.txt` contains Adobe’s notice, Reserved Font Name, and the complete OFL conditions. On the supplied unmodified-copy evidence, redistribution with that adjacent licence is consistent with those conditions; selecting it through the CSS family alias does not modify the font. A documented, versioned intermediary package is acceptable provenance here. The record supplies source, version, hash, licence, and redistribution requirements. Outside the diff, [package.json:19](/C:/Users/38909/Documents/worktrees/voxel-hudfont/package.json:19) excludes fixtures through its `files` allowlist.

The font gate rejects empty font lists, platform fonts, and unexpected family names. The diagnostic count and mandatory single probe prevent an empty instrument result from passing on the current page. Forcing layout before querying the probe is sound. Its result establishes custom-font family usage for the inspected DOM and character probe—not font-file integrity or identical rasterisation. The stated state/source bounds are appropriate for the current fixture.

The flags affect text throughout the browser suite, potentially including layout and canvas text; their effect is not inherently restricted to five images. They deliberately remove native rasterisation differences. I inspected all five replacement PNGs at original resolution and found no visible font/layout defect. Outside the diff, [model-studio-shell.spec.ts:31](/C:/Users/38909/Documents/worktrees/voxel-hudfont/tests/browser/model-studio-shell.spec.ts:31) confirms that the shell baseline hides its text. Combined with the supplied whole-suite results and pixel comparisons, the five-image regeneration is justified without changing tolerances.

The helper retains the same presentation predicate, matching evidence snapshot semantics, and initial missing-harness errors. Current callers await advances on a stable page. Disposal leaves the global harness installed ([oak-browser-host.ts:405](/C:/Users/38909/Documents/worktrees/voxel-hudfont/fixtures/oak-ecosystem-consumer/oak-browser-host.ts:405)), so both paths continue reading the same disposed harness; neither adds a disposal-specific rejection.

Navigation is different: `evaluate` rejects when its execution context disappears, whereas `waitForFunction` can retry in the replacement document. Likewise, the new helper retains its original harness instead of following a replacement global. Neither behavior breaks a current caller. There is no newly lost finite action timeout in this suite: its Playwright configuration uses the runner’s zero action-timeout default, leaving both paths bounded by the test timeout.

**Taken from the owner’s evidence**

I did not independently reproduce the installed Streamlit byte comparison, decoded font metadata, packaging dry run, negative font mutation, exact pixel-difference bounds, Linux/Windows executions, or timing improvements.

Those results support the font repair and helper optimization. The helper-inclusive full verification was still running in the supplied evidence; this review does not certify its result or completion of both CI legs.



### Claude (claude-opus-5-5[1m], effort max)

[Edit note, not the reviewer's words: the report's own level-2 headings are demoted to level 4 so they nest under this one. Nothing else changed.]

**FIX-THEN-SHIP**

#### Findings

**F1 [should-fix] `docs/architecture/supply-chain.md:44`** (also `oak-browser-host.css:12`). The font's origin is traced only as far as streamlit. "Unmodified" is shown against streamlit's copy, but nothing compares the bytes with Adobe's own release (adobe-fonts/source-sans 3.052). The OFL lets anyone redistribute the font, so the copy is lawful. But the paragraph uses "unmodified" to justify keeping a font name that contains the reserved name "Source", and that depends on matching Adobe's file. I read the font's table list: it looks like a complete Adobe build, with a 24,347-byte `post` table that keeps glyph names and no WOFF2 metadata block. That fits, but it isn't proof. Name the Adobe release and say whether its hash was compared.

**F2 [should-fix] `docs/architecture/supply-chain.md:6-8`**. The header still says every figure comes from `test:supply-chain` and "Nothing below is asserted by hand". The new paragraph (lines 39-50) states a hash, a size and a version by hand, and says no gate checks them. The owner's rule in `rules/docs.md:9` asks for executable proof of number claims. A small unit test that hashes the woff2 and requires `OFL.txt` would fix both problems. The new paragraph is also hard-wrapped, which R25 forbids.

**F3 [should-fix] `docs/learning/gate-proofs.md:30`**. The only mutation (putting "Segoe UI" first) turns everything red because of the font family. Nothing tests what the probe line is for: one character the bundled font lacks, drawn by a fallback font. So the claim at `oak-ecosystem-font.spec.ts:29-31` is believed, not proven; add that mutation. Also add to the bounds at spec lines 37-41: a character that no installed font has would probably be drawn as the bundled font's missing-glyph box, reported as `SourceSans3VF`, and pass.

**F4 [should-fix] `docs/devlog/summary.md:3`, `docs/work/5_vite-advisories/plan.md:78`**. Neither CI run includes the helper change (run 42300848349 is at 8ba2f25), so the 85% against 60% gap is just two different runners. Say plainly that the helper's effect on Linux CI hasn't been measured. Also, "because every round trip waits behind a frame on the page's main thread" (repeated in `oak-ecosystem-browser-support.ts:363-366`) claims a cause for every case, and the A/B timing doesn't isolate that cause. Narrow it to what was measured.

**F5 [nit] `tests/browser/oak-ecosystem-font.spec.ts:21`**. "Until 2026-09-22" is left over from the draft that never ran; the CSS comment (`oak-browser-host.css:6`) was corrected to 2026-11-06. Line 43 says the flags "pin rasterisation", which is stronger than `playwright.config.ts:125`, where they only "aim to".

**F6 [nit] `docs/devlog/summary.md:4`, `oak-browser-host.css:17`**. "Fails if any HUD glyph comes from another face" promises more than the gate's own stated bounds.

**F7 [nit] `tests/browser/oak-ecosystem-stages.spec.ts:81-86`**. The measurement this test's time budget is built on (42.3 s) was already below the old helper's 49.5–51.7 s. With the new helper's 40.7 s it fits again; record that next to the budget.

**F8 [nit] `docs/work/2_oak-font-diagnostic/plan.md:3`**. This plan still says "Status: active", but this change repairs the failures it was observing. Nothing says whether `tests/browser/oak-font-diagnostics.ts` is still needed.

#### Verified myself

- **Font file:** its SHA-256 is `5f16566f…acbd8`, as recorded. From a hex dump of the header: 170,188 bytes, TrueType outlines, version 3.052, and exactly the 20 tables the owner listed. There is no `fpgm`, `prep`, `cvt ` or `gasp` table.
- **Licence:** `OFL.txt` matches the standard OFL 1.1 text as I know it. Its header is the font's own embedded copyright notice plus Adobe's trademark line, not the wording of Adobe's licence file, which I couldn't check offline. That satisfies OFL clause 2, because the unmodified font also carries the notice inside it. The reserved-name limit (clause 3) applies only to modified versions, and a CSS family name is just a label inside the page.
- **Package:** the font isn't packed (`package.json:19-22`), and the supply-chain gate only walks `node_modules` (`scripts/verify-supply-chain.mjs:271`).
- **Gate:** it can't pass by measuring nothing:
  - An element with no fonts fails (lines 179-181).
  - The diagnostics row count (lines 206-207) catches an empty result.
  - The family name and the bundled-font flag must match exactly.
  - The probe line must be found exactly once.
  
  Forcing layout before measuring is sound. Other HUD text changes inside animation frames (`oak-browser-presented-fps.ts:109-121`), so layout is up to date when DevTools reads it. Against the draft `573c6f3`, the gate, CSS, licence and config differ only in the forced layout and the comment dates.
- **Baselines:** exactly these five show the HUD. Every other oak capture hides `.hud` (`oak-ecosystem.spec.ts:344,382,461`; stages spec 131, 213, 300; weather spec 97). The wind-start comparison is a hard `toMatchSnapshot` (`oak-ecosystem-weather.spec.ts:284`), so the three later wind frames were never compared on Linux. Regenerating all five is justified, and no tolerance changed.
- **Images:** I looked at the new and old HUD page and the new wind-start frame. The text is legible, the en dash draws, and the changes stay inside the panel. Three studio baselines I checked have no text, and the zero-tolerance studio shell baseline hides its text (`model-studio-shell.spec.ts:31-38`).
- **Flags:** they loosen nothing and can't hide line-wrapping or layout differences. They remove subpixel-coloured and hinted text, which the suite never compared across platforms anyway. Unhinted glyph widths can shift text layout on Linux on any page; only the full suite runs rule that out.
- **Helper:** behaves the same as before.
  - `ready` is a boolean (`oak-browser-contract.ts:102`), so the check is unchanged. The target revision, error messages and returned evidence are the same; the evidence is now captured when the check passes rather than in a later round trip.
  - If the harness is disposed mid-wait, both versions keep polling until the test times out, because `evidence()` still works after dispose (`oak-browser-host.ts:405-420`).
  - If the page navigates mid-wait, the old `waitForFunction` kept polling in the new page and could even pass on that page's revisions. The new code fails immediately, which is stricter.
  - Nothing new can hang: no action timeout is configured, so both versions are limited only by the test's time budget.
- **Budget:** 45,000 + 4×42,300 = 214,200 ms (`tests/testing/test-timeout.ts`).
- **History:** "Segoe UI" entered the stylesheet in `d129905` (2026-09-05).

#### Taken from the owner's evidence

- The font being byte-identical to streamlit's file, and the decoded name-table strings, including `SourceSans3VF`.
- All CI runs, their results and runner images.
- The Windows pixel counts and the box the changed pixels fall in.
- The red result when "Segoe UI" was put back.
- The A/B timings.
- The `npm pack` listing.
- The verify results; the verify that includes the helper change is still running.

Linux's margin under the 0.002 tolerance isn't reported anywhere.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | The font is traced only to streamlit's copy, but "unmodified" needs Adobe's own release file (Claude F1). | Accepted. GitHub's tree listing of `adobe-fonts/source-sans` at tag `3.052R` gives `WOFF2/VF/SourceSans3VF-Upright.ttf.woff2` as Git blob `96cc9fd06ceb275ec3d6103ad97c5647212c88c5`, 170,188 bytes, and `git hash-object` gives the vendored file the same blob. No file was downloaded. | The supply-chain record, the stylesheet's comment, the defect register and the new test name Adobe's release file. |
| F1 | The supply-chain record's opening says nothing is asserted by hand, while the new paragraph states a hash, size and version no gate checks, and the paragraph is hard-wrapped (Codex F1, Claude F2). | Accepted. | The opening now scopes the gate to npm packages and names the new `fixtures/oak-ecosystem-consumer/oak-browser-font.test.ts`, which holds the font's size, SHA-256, licence and folder. It failed with one byte appended to the font and passed with the font restored byte for byte. Both paragraphs are one line each. |
| F2 | Nothing proves the probe line's purpose, a character the bundled face lacks; and a character no installed font has would likely pass as the face's missing-glyph box (Claude F3). | Accepted. | Mutation run: `<!-- 樫 -->` appended to `oak-browser-host.html` made the gate fail, the probe drawn partly in `Noto Sans SC`; restored, it passed. The missing-glyph case is a stated bound in the gate's header and its gate proof. |
| F3 | No CI run includes the helper change, and the stated cause ("every round trip waits behind a frame") is not what the A/B isolates (Claude F4). | Accepted. | The devlog line, the plan and the helper's comment now say only what was measured on this workstation and that no CI run has measured it. |
| F4 | The gate's header says "Until 2026-09-22", and that the flags "pin" rasterisation (Codex F2, Claude F5). | Accepted. | "Until 2026-11-06", with the Linux leg's history, and "aim to pin". |
| F5 | "Fails if any HUD glyph comes from another face" promises more than the gate's bounds (Claude F6). | Accepted. | The devlog line and the stylesheet's comment say it fails if DevTools reports another face for the HUD text it measures; the defect register names the missing-glyph bound. |
| F6 | The `stages:76` budget is built on 42.3 s, which the old helpers already exceeded here (Claude F7). | Accepted. | The test's comment records 49.5 to 51.7 s with the old helpers and 40.7 to 40.8 s with the new. |
| F7 | Work unit 2's plan still says "active", and nothing says whether `tests/browser/oak-font-diagnostics.ts` is still needed (Claude F8). | Not acted on here. Work unit 2 is another owner's record, and its diagnostic can still report which face each CI image draws. | Reported to the coordinator, for the owner to close or keep. |
| F8 | The Linux run does not report how far inside the 0.002 tolerance each HUD baseline came (Claude, closing note). | Accepted as a bound; a passing screenshot assertion reports no pixel count. | None. |

## Verification

In the worktree `C:/Users/38909/Documents/worktrees/voxel-hudfont`, on Windows with Node 24.18.1:

- Before the fixes, on the reviewed tree (`9713894`): `npm run verify` exited 0 in 24 min 10 s, with 2,434 unit tests (1 skipped) and 137 of 137 browser tests.
- After the fixes: the new font test passed (3 tests), failed with one byte appended to the font, and passed with it restored; the probe mutation above; ESLint clean on the four changed test files; the tests that read the docs passed (199); `git diff --check` clean.
- Final `npm run verify` on the fixed tree: exit 0 in 26 min 48 s on `9713894` plus the fixes above, with every stage passing: 2,437 unit tests (1 skipped), the 3 new font tests among them, and 137 of 137 browser tests in 17.2 minutes. This record's last edit, which writes this line, and the plan's line for this round came after it; the tests that read the docs were run again on them before committing.

## Round outcome

Both lanes kept. Codex answered SHIP with two nits; Claude answered FIX-THEN-SHIP with four should-fix findings and four nits. Neither found a problem with the font's licence, the flags, the five regenerated baselines or the helper's behaviour, and Claude confirmed that the new helper fails sooner than the old one when the page navigates mid-wait. F0 to F6 were fixed or answered, F7 is left to the owner with its reason, and F8 is a stated bound. The fixes are records, comments and one new unit test; they were checked by the tests above, not by a third review round.
