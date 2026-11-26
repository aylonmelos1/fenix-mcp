import assert from "node:assert/strict";
import test from "node:test";
import { collectComments, findAddedCommentFindings, parseAddedLineMap, selectDefaultBase } from "../scripts/check-no-comments.mjs";

test("diff parsing records only added line numbers", () => {
  const diff = [
    "diff --git a/src/example.js b/src/example.js",
    "--- a/src/example.js",
    "+++ b/src/example.js",
    "@@ -1,2 +1,3 @@",
    " const before = 1;",
    "-const removed = 2;",
    "+const after = 3;",
    "+const value = 4; // narration",
    " const tail = 5;"
  ].join("\n");
  const added = parseAddedLineMap(diff);
  assert.deepEqual([...added.get("src/example.js")], [2, 3]);
});

test("reports a comment on an added JavaScript line", () => {
  const source = "const value = 1; // narration";
  const findings = findAddedCommentFindings("src/example.js", source, new Set([1]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
});

test("ignores comment markers inside JavaScript strings", () => {
  const source = "const url = \"https://example.org/path\";\nconst text = \"/* sample */\";";
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1, 2])), []);
});

test("detects an added line inside a block comment that started earlier", () => {
  const source = "const value = 1;\n/* first line\n * narration\n */";
  const findings = findAddedCommentFindings("src/example.js", source, new Set([3]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("allows an SPDX license block at the file header", () => {
  const source = "/*\n * SPDX-License-Identifier: MIT\n */\nexport const value = 1;";
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1, 2, 3])), []);
});

test("allows JSDoc contracts on exported declarations", () => {
  const source = "/**\n * @param {string} value\n * @returns {string}\n */\nexport function publicApi(value) { return value; }";
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1, 2, 3, 4])), []);
});

test("rejects JSDoc without an exported contract", () => {
  const source = "/** narration */\nfunction internalApi() {}";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([1])).length, 1);
});

test("allows exact formatting directives and aesthetic lint suppressions", () => {
  const source = [
    "// prettier-ignore",
    "// eslint-disable-next-line max-len",
    "const value = 1;"
  ].join("\n");
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1, 2])), []);
});

test("rejects broad lint suppressions", () => {
  const source = "// eslint-disable-next-line";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([1])).length, 1);
});

test("allows a short linked external limitation reference on a recognized documentation host", () => {
  const source = "// External limitation: upstream requires this shape; https://docs.github.com/en/rest";
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1])), []);
});

test("rejects placeholder or generic hosts for external limitation exceptions", () => {
  const placeholder = "// External limitation: upstream requires this shape; https://example.org/docs";
  const generic = "// External limitation: upstream requires this shape; https://vendor.invalid/docs";
  assert.equal(findAddedCommentFindings("src/example.js", placeholder, new Set([1])).length, 1);
  assert.equal(findAddedCommentFindings("src/example.js", generic, new Set([1])).length, 1);
});

test("scans shell comments but ignores shebangs and quoted markers", () => {
  const source = "#!/usr/bin/env bash\nVALUE=\"# literal\"\n# narration";
  const findings = findAddedCommentFindings("scripts/check.sh", source, new Set([1, 2, 3]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("does not treat JSON string values as comments", () => {
  const source = "{\"url\":\"https://example.org\"}";
  assert.deepEqual(findAddedCommentFindings("config.json", source, new Set([1])), []);
});

test("prefers the main remote when selecting a default base", () => {
  assert.equal(selectDefaultBase({ hasOriginMain: true }), "origin/main");
});

test("uses HEAD only for a dirty isolated checkout without a main ref", () => {
  assert.equal(selectDefaultBase({ hasLocalChanges: true }), "HEAD");
});

test("fails closed when no default base can be resolved", () => {
  assert.throws(() => selectDefaultBase({}), /No base ref found/);
});

test("prefers the explicit base SHA", () => {
  assert.equal(selectDefaultBase({ baseSha: "47af940" }), "47af940");
});

test("scans YAML and SQL comments while ignoring quoted markers", () => {
  const yaml = "value: \"# sample\"\n# narration";
  const sql = "select '-- sample';\n-- narration";
  assert.equal(findAddedCommentFindings(".github/workflows/check.yml", yaml, new Set([2])).length, 1);
  assert.equal(findAddedCommentFindings("sql/check.sql", sql, new Set([2])).length, 1);
});

test("scans comments in environment example files", () => {
  const source = "TOKEN=example\n# narration";
  assert.equal(findAddedCommentFindings(".env.example", source, new Set([2])).length, 1);
});

test("rejects an SPDX marker outside the file header", () => {
  const source = "const value = 1;\n/* SPDX-License-Identifier: MIT */";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([2])).length, 1);
});

test("rejects linked comments that lack the external limitation label", () => {
  const source = "// See https://example.org/docs";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([1])).length, 1);
});

test("ignores comment markers inside Python triple-quoted strings", () => {
  const quote = String.fromCharCode(39).repeat(3);
  const source = "value = " + quote + "\n# sample\n" + quote;
  assert.deepEqual(findAddedCommentFindings("scripts/example.py", source, new Set([2])), []);
});

test("detects comments inside JavaScript template expressions", () => {
  const tick = String.fromCharCode(96);
  const source = "const result = " + tick + "value $" + "{" + "({ field: 1 /* narration */ })}" + tick + ";";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([1])).length, 1);
});

test("ignores comment markers in JavaScript template text", () => {
  const tick = String.fromCharCode(96);
  const source = "const result = " + tick + "https://example.org /* text */" + tick + ";";
  assert.deepEqual(findAddedCommentFindings("src/example.js", source, new Set([1])), []);
});

test("collects comment tokens in JavaScript template expressions", () => {
  const tick = String.fromCharCode(96);
  const source = "const result = " + tick + "value $" + "{" + "({ field: 1 /* narration */ })}" + tick + ";";
  const comments = collectComments(source, {
    line: ["//"],
    block: [["/*", "*/"]],
    quotes: ["'", "\"", tick],
    templateInterpolations: true
  });
  assert.equal(comments.length, 1);
});

test("keeps exact finding lines before and after a multiline block comment", () => {
  const source = "const before = 0; // before\n/* block starts\n * continues\n */\nconst after = 1; // after";
  const findings = findAddedCommentFindings("src/example.js", source, new Set([1, 5]));
  assert.deepEqual(findings.map(finding => finding.line), [1, 5]);
});

test("ignores slash pairs in regex literals and finds a real trailing comment", () => {
  const source = "const pattern = /[//]/; // narration";
  const findings = findAddedCommentFindings("src/example.js", source, new Set([1]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].text, "narration");
});

test("fails closed on unterminated JavaScript strings", () => {
  const source = "const value = \"unterminated";
  assert.throws(() => findAddedCommentFindings("src/example.js", source, new Set([1])), /Unterminated string/);
});

test("fails closed on malformed JavaScript regex literals", () => {
  const unterminated = "const matcher = /[/;";
  const invalid = "const matcher = /(/;";
  assert.throws(() => findAddedCommentFindings("src/example.js", unterminated, new Set([1])), /Unterminated regular expression/);
  assert.throws(() => findAddedCommentFindings("src/example.js", invalid, new Set([1])), /Invalid regular expression/);
});

test("fails closed on unterminated JavaScript template expressions", () => {
  const tick = String.fromCharCode(96);
  const source = "const value = " + tick + "result $" + "{" + "value";
  assert.throws(() => findAddedCommentFindings("src/example.js", source, new Set([1])), /Unterminated template expression/);
});

test("rejects external limitation URLs with user information", () => {
  const source = "// External limitation: upstream requires this shape; https://reader@docs.github.com/en/rest";
  assert.equal(findAddedCommentFindings("src/example.js", source, new Set([1])).length, 1);
});
