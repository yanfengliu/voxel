# Review 7: stale far-view reference

## Target

Townscaper's committed town-moebius-far.png reference and two independent pixel comparisons: the coverage=1 causal control versus the old reference, then the losslessly packed current capture versus its native PNG. The tracked runtime and test tolerance are unchanged by this prerequisite.

## Reviewers and coverage

Independent gpt-6-astra at xhigh decoded both pairs using a Python standard-library PNG decoder, validating chunk CRCs and all five row filters and normalizing RGB/RGBA to RGBA. It wrote only ignored evidence and launched no browser.

## Reports

The coverage=1 control exactly reproduces the committed far baseline's decoded pixels: zero differing pixels or channels and maximum delta zero across 3,706,880 RGBA bytes at 1280 by 724. Both decoded SHA256 values are c005b9cc0e5a144bb775a25423161528a26a2339b545d295cb9df734d0ca0d40. Independent comparison record digest: de79969e1bc1af496664e8592b985a4a0474f1bf1d30b743dadab503140b9a91.

The packed current PNG is lossless and below the 512 KiB binary limit: 523,082 bytes, encoded SHA256 a6650d7e7b75be22d796d3d588bf71d0d72fec47556a586ab0882ee2b3d010db. Both current images have valid CRCs and identical decoded RGBA data, with zero differing pixels or channels. Common decoded SHA256: dc3f4f9c778e375ddd72c37236b55da8d1a9aa11662a95090e43116888a675a4. Independent comparison record digest: 46ae498dbc2abefec4fbeb041bc0d420351744037ee24d256552ec9b4e5f7bc1.

## Findings and disposition

No material finding. Accept the packed current capture as the sole refreshed reference after the unchanged baseline gate passes. Do not change runtime behavior or relax comparison thresholds.

## Verification

The old reference was last updated at b73f982, before the intentional outline-lightening change in 6aefc784 on October 17. The candidate and original-tone-module controls produced the same native current PNG (SHA256 7a8f77d89c3b50f4892a7592ac147d59f88c42bbfcbfb24c3e35169cd1d6ecb0); the Vite patch update also preserved it. With normal source, the unchanged baseline gate passed 12 views and reported 0.078% differing pixels for the far view against its 0.02% threshold.

Reproduce the causal control on Townscaper 2df6eb4 plus this adoption: serve the ordinary Vite configuration with a pre-load override for src/rendering/artStyleResolvePass.ts that replaces exactly one assignment `this.resolveMaterial.uniforms.uInkCoverage!.value = Math.max(.35, Math.min(1, Math.sqrt(scale)));` with `this.resolveMaterial.uniforms.uInkCoverage!.value = 1;`. Run `npm run test:renderer-baseline -- --origin http://127.0.0.1:4197` against that owned server and the old reference; all 13 views matched. A copy of the same harness with capture persistence after stable validation supplied the success PNG for independent decoding. Restore the actual source and rerun the unchanged command to obtain the accepted lighter outline. Use the original harness launch flags and viewport; the far canvas is 1280 by 724. No control is retained in production source.

Local evidence lives under isolated Townscaper output/tone-sharing: ink-coverage-control.vite.mjs, ink-coverage-control-independent-rgba.json, far-packed-independent-rgba.json, far-lossless-packing.json and the corresponding native captures. The packing only removes verified opaque alpha and recompresses; independent decoding proves every resulting RGB sample is preserved.

## Round outcome

Exact old-reference recovery confirms the stale reference belongs to the intentional October outline change. Pixel-preserving packing is accepted; the final normal-source baseline run, source pin and consumer integration acceptance remain separate.
