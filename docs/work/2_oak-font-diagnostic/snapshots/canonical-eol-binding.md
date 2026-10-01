# Canonical source binding after the local diagnostic gate

Authored by the engine-feedback worker on2026-10-01. This is a bounded source integration conclusion, not a raw runtime capture or a replacement for independent review.

The gate ran exact reviewed raw bytes at base6e28629. Full13 resultSHA073a20eb29de3d3db96d52aa98112dee675ec1f16a26f22f7fa14a0cc56152b0 records actual0/1072.820s,2412 unit passes plus one existing file/test skip and135 browser passes. Primary/runtime/source/baseline identities and cleanup passed. Root independently accepted the execution and narrow EOL proof before private source-only commit6fa33f4a61f6555aeb32ec687dc82d0224cda188, tree46a2bdeee8fde827a93981002bab16f338a8e37e. Main/dispatch remain held for final integration acceptance.

| Source | Reviewed/gated raw SHA256 | Committed SHA256 | Git blob |
|---|---|---|---|
| .github/workflows/oak-font-diagnostic.yml | f581a34842d6a74149b5027988c783e06c6298f2e1909db3b59e95e541954284 | f581a34842d6a74149b5027988c783e06c6298f2e1909db3b59e95e541954284 | b38ca097edaa49bae8e91187297a4d07b1ded9c4 |
| scripts/verify-oak-font-diagnostic.mjs | a2d998ee3e0e156bf53ad7c18b1bf902400039495d16c7c8c1c684c58939f058 | a2d998ee3e0e156bf53ad7c18b1bf902400039495d16c7c8c1c684c58939f058 | 9ae8143aae6d3735d8f4d5f2011a226979b88ce2 |
| tests/browser/oak-ecosystem-weather.spec.ts | 68685807f3c1ea4f141ad5b7fcf26a67614c269132efd8f3c5536497ebef32b5 | dd68eebeb1b5e4f33423f1e978047e3e753fcb8ee7b7b4908e6fb8cc9f7f9940 | acb8392b6c2235dd03e00319e3ff95caa38f3285 |
| tests/browser/oak-ecosystem.spec.ts | 629bd93bc466890c4819be6ef030ac12fae2197ea02ff63b87c75a85e0f5b23f | fb79eaa74068d0a583d056a466d56c9039f08743f2801419e283b37dcb3a643f | 5f7a8331129d72d85cb04306e7894958a0fda6c1 |
| tests/browser/oak-font-diagnostics.ts | 4ea78d38159103dd53b0a3aeb50291995dbaca16aeedbad2f035c7c36429e895 | 4ea78d38159103dd53b0a3aeb50291995dbaca16aeedbad2f035c7c36429e895 | b283f45ea17a54ed06f216ee4485f92a37f121a6 |
| tests/testing/oak-font-diagnostics.test.ts | fba3c74ae4aed172404d276131f19d06f083a9d697ef55f8a68d33ef2b2912b4 | fba3c74ae4aed172404d276131f19d06f083a9d697ef55f8a68d33ef2b2912b4 | dea516942365e2cb1522e00efd005b251778d5ba |

Only the existing weather and main callers convert CRLF to LF (346 and512 line endings). The four other source files are byte-identical. Actual TypeScript5.9.3 ES2022 compilation of both caller raw/canonical pairs produces byte-identical JavaScript without maps and zero diagnostics; shebang, String.raw and literal risks were inspected. No separate canonical-checkout full gate is claimed. Exact complete proofSHAd1905ec154e048b0d5d94e9fca453889a024d46280267c19996c03befb96e501, raw/canonical copies and private-source-commit.json remain recoverable in ignored tmp/engine-feedback/font-diagnostic-tests/full-gate-1/canonical-eol and its parent.

Original independent reports remain verbatim in separate work2 snapshots with their own actual scope. Existing Linux fonts remain UNKNOWN; hosted pixels/headroom and Windows deadline are open. No source semantic change, runtime/dependency/font/baseline/budget change or performance claim accompanies this normalization.
