# Review 2: delivery documentation

## Target

Doc-only working candidate on 083f713fd0b2b552455e9c96cba209fdd360e496, inspected by the coordinating art agent. File SHA-256 bindings: `docs/guides/voxel-palette-style.md` at `1c61ce99f848231cff64f1367291933c84c4d3477f8dfdff53efdeb5d3e7046c`, and `docs/work/3_palette-face-tones/plan.md` at `fc50744ed582c7ea43f6e4fbcdcafef5089d4c18b73d07bc77ba0f410d263930`. These are the inspected pre-correction bytes, retained in the task's doc-check record. No code-review credit is inferred. The reviewer model identity was not recorded.

## Authored report

Read final two-file closure diff. No material issue: pitch ownership, failed raw comparator/12-view control bounds, uncertainty and no-budget-change language remain accurate. Minor count precision before closure: say '2434 unit passes and one existing skip' (and baseline '2412 unit passes and one skip'), rather than '2434 unit cases (one skip)', which could imply 2433 passed. Retain this authored supplemental delivery-doc review in work3 review history or append review1 with exact target files/hash when final; no new code review credit inferred.

## Disposition and bound

Accepted the pass/skip wording correction in the plan. No source, test, artifact or gate verdict changed. The pinned source review remains review 0. Final hosted outcomes and cleanup are recorded after observation; those facts were pending at the inspected candidate and are not retroactively presented as reviewed results.

## Supplemental numeric review

The coordinating agent subsequently checked retained M09 capture/viewer bytes and supplied this authored correction; it reviewed the projection inputs rather than a new final repository diff:

One last numeric wording precision found while reading retained capture settings: matched height419/span165 gives 2.53939 px per camera-vertical unit; camera-target delta[200,140,300] foreshortens a one-unit world-Y edge to 2.367205px. The guide/plan's 'projecting about2.37pixels' is correct for world-Y edges but should name that bound, e.g. 'whose world-Y edges project to about2.37pixels at the matched camera (419px height, span165)'. No render/code change needed. I checked actual m09 capture/viewer bytes and calculation; keep this as a minor doc precision with root delivery review history.

Accepted: guide and plan now name world-Y edges and the matched height/span. The implementer independently recomputed `(419/165) × sqrt((200²+300²)/(200²+140²+300²)) = 2.367205483329954`; camera-vertical scale alone is 2.5393939393939395 pixels per unit. No render, content or source-code change followed.

## Supplemental hosted-evidence inspection

The coordinating agent independently inspected Linux job 117758800610 on source/integration commit 083f713, its failure-log lines 1216–1413 and the retained native mature-HUD actual/expected/diff PNGs from artifact 12147419427. SHA-256 bindings: actual `804d3373606cde2791220836a29027a5804f9a69137fa2930da62553bae8faca`, expected `4cbece88ce3e4164f633642a31185e7964bd158e3fbe17b4738fba15dc8822ac`, diff `44dec41f307f3063f00737e12049a6e5716b5f14fe6a5eedf7d522a1f3bd3723`. Its authored report follows; this is evidence inspection, with no new source-review credit:

I independently read actual Linux log failure lines1216..1413 and inspected native mature HUD actual/expected/diff from your retained selection. HUD text weight/wrapping/button layout differs; 3D tree/terrain pixels appear stable in diff. This supports observed HUD mismatch only, not a font identity/root cause. 134pass/2fail and185.5/214s87% headroom match raw log. Good retention of old exact hash pairs/new palette CI pixels. No scope expansion or assertion/budget relaxation.

Accepted within the reported bounds. Neither this inspection nor matching prior PNG hashes establishes the host's actual font identity. The hosted job remains failed; no baseline, assertion or budget was changed.
