import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const javascriptExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const commentSpecs = new Map([
  [".cjs", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".js", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".jsx", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".mjs", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".ts", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".tsx", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), templateInterpolations: true, regexLiterals: true, singleLineStrings: true }],
  [".json", { line: [], block: [], quotes: ["'", "\""], singleLineStrings: true }],
  [".jsonc", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]), singleLineStrings: true }],
  [".yml", { line: ["#"], block: [], quotes: ["'", "\""] }],
  [".yaml", { line: ["#"], block: [], quotes: ["'", "\""] }],
  [".sh", { line: ["#"], block: [], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }],
  [".bash", { line: ["#"], block: [], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }],
  [".py", { line: ["#"], block: [], quotes: ["'", "\""], multilineQuotes: [String.fromCharCode(39).repeat(3), String.fromCharCode(34).repeat(3)], singleLineStrings: true }],
  [".sql", { line: ["--"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }],
  [".css", { line: [], block: [["/*", "*/"]], quotes: ["'", "\""] }],
  [".scss", { line: ["//"], block: [["/*", "*/"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }],
  [".html", { line: [], block: [["<!--", "-->"]], quotes: ["'", "\""] }],
  [".xml", { line: [], block: [["<!--", "-->"]], quotes: ["'", "\""] }],
  [".md", { line: [], block: [["<!--", "-->"]], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }],
  [".toml", { line: ["#"], block: [], quotes: ["'", "\""] }],
  [".ini", { line: ["#", ";"], block: [], quotes: ["'", "\""] }],
  [".conf", { line: ["#", ";"], block: [], quotes: ["'", "\""] }],
  [".env", { line: ["#"], block: [], quotes: ["'", "\""] }],
  [".tf", { line: ["#", "//"], block: [["/*", "*/"]], quotes: ["'", "\""] }],
  [".hcl", { line: ["#", "//"], block: [["/*", "*/"]], quotes: ["'", "\""] }],
  [".properties", { line: ["#", "!"], block: [], quotes: ["'", "\""] }],
  [".mk", { line: ["#"], block: [], quotes: ["'", "\""].concat([String.fromCharCode(96)]) }]
]);

function commentSpec(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) {
    return { line: ["#"], block: [], quotes: ["'", "\""] };
  }
  if (name === "makefile") {
    return { line: ["#"], block: [], quotes: ["'", "\""].concat([String.fromCharCode(96)]) };
  }
  if (name === ".env" || name.startsWith(".env.") || name === ".gitignore" || name === ".dockerignore") {
    return { line: ["#"], block: [], quotes: ["'", "\""] };
  }
  return commentSpecs.get(path.extname(filePath).toLowerCase());
}

function countNewlines(value) {
  return (value.match(/\n/g) || []).length;
}

const regexPrefixWords = new Set([
  "await",
  "case",
  "const",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "from",
  "function",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "var",
  "void",
  "while",
  "yield"
]);

const controlParenWords = new Set(["catch", "for", "if", "switch", "while", "with"]);

function skipRegexLiteral(source, start, line) {
  let escaped = false;
  let inCharacterClass = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n" || character === "\r") {
      throw new Error("Unterminated regular expression literal at line " + line);
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (character === "/" && !inCharacterClass) {
      const close = index;
      let finish = index + 1;
      while (finish < source.length && /[A-Za-z]/.test(source[finish])) {
        finish += 1;
      }
      const flags = source.slice(close + 1, finish);
      const next = source[finish];
      if (next && /[A-Za-z0-9_$]/.test(next)) {
        throw new Error("Invalid regular expression literal at line " + line);
      }
      try {
        new RegExp(source.slice(start + 1, close), flags);
      } catch {
        throw new Error("Invalid regular expression literal at line " + line);
      }
      return finish;
    }
  }

  throw new Error("Unterminated regular expression literal at line " + line);
}

export function collectComments(source, spec) {
  const comments = [];
  const templateStack = [];
  const parenStack = [];
  const templateQuote = String.fromCharCode(96);
  const templateExpression = "$" + "{";
  let index = 0;
  let line = 1;
  let quote = null;
  let escaped = false;
  let canStartRegex = true;
  let pendingControlParen = false;

  while (index < source.length) {
    const character = source[index];

    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (quote === templateQuote && source.startsWith(templateExpression, index)) {
        templateStack.at(-1).expressionDepth = 1;
        quote = null;
        canStartRegex = true;
        index += templateExpression.length;
        continue;
      } else if (source.startsWith(quote, index)) {
        index += quote.length;
        if (quote === templateQuote) {
          templateStack.pop();
          canStartRegex = false;
        } else {
          canStartRegex = false;
        }
        quote = null;
        continue;
      } else if (character === "\n" && spec.singleLineStrings && quote.length === 1 && quote !== templateQuote) {
        throw new Error("Unterminated string literal at line " + line);
      }
      if (character === "\n") {
        line += 1;
      }
      index += 1;
      continue;
    }

    if (index === 0 && source.startsWith("#!", index)) {
      const end = source.indexOf("\n", index);
      if (end === -1) {
        break;
      }
      index = end + 1;
      line += 1;
      continue;
    }

    const blockToken = spec.block.find(([start]) => source.startsWith(start, index));
    if (blockToken) {
      const [start, end] = blockToken;
      const closing = source.indexOf(end, index + start.length);
      if (closing === -1) {
        throw new Error("Unterminated block comment at line " + line);
      }
      const finish = closing + end.length;
      const text = source.slice(index, finish);
      const endLine = line + countNewlines(text);
      comments.push({ startLine: line, endLine, startOffset: index, text, kind: "block" });
      line = endLine;
      index = finish;
      continue;
    }

    const lineToken = spec.line.find(token => source.startsWith(token, index));
    if (lineToken) {
      const end = source.indexOf("\n", index);
      const finish = end === -1 ? source.length : end;
      const text = source.slice(index, finish);
      comments.push({ startLine: line, endLine: line, startOffset: index, text, kind: "line" });
      index = finish;
      continue;
    }

    if (templateStack.length > 0 && templateStack.at(-1).expressionDepth > 0) {
      if (character === "{") {
        templateStack.at(-1).expressionDepth += 1;
        canStartRegex = true;
        index += 1;
        continue;
      }
      if (character === "}") {
        templateStack.at(-1).expressionDepth -= 1;
        index += 1;
        if (templateStack.at(-1).expressionDepth === 0) {
          quote = templateQuote;
        } else {
          canStartRegex = false;
        }
        continue;
      }
    }

    if (spec.templateInterpolations && character === templateQuote) {
      templateStack.push({ expressionDepth: 0 });
      quote = templateQuote;
      canStartRegex = false;
      index += 1;
      continue;
    }

    const multilineQuote = (spec.multilineQuotes || []).find(token => source.startsWith(token, index));
    if (multilineQuote) {
      quote = multilineQuote;
      canStartRegex = false;
      index += multilineQuote.length;
      continue;
    }

    if (spec.quotes.includes(character)) {
      quote = character;
      canStartRegex = false;
      index += 1;
      continue;
    }

    if (spec.regexLiterals && character === "/") {
      if (canStartRegex) {
        index = skipRegexLiteral(source, index, line);
        canStartRegex = false;
      } else {
        canStartRegex = true;
        index += 1;
      }
      pendingControlParen = false;
      continue;
    }

    if (spec.regexLiterals) {
      const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index));
      if (identifier) {
        const word = identifier[0];
        canStartRegex = regexPrefixWords.has(word);
        pendingControlParen = controlParenWords.has(word);
        index += word.length;
        continue;
      }

      if (/\s/.test(character)) {
        if (character === "\n") {
          line += 1;
        }
        index += 1;
        continue;
      }

      if (pendingControlParen && character !== "(") {
        pendingControlParen = false;
      }

      if (character === "(") {
        parenStack.push(pendingControlParen);
        pendingControlParen = false;
        canStartRegex = true;
        index += 1;
        continue;
      }
      if (character === ")") {
        canStartRegex = parenStack.pop() === true;
        index += 1;
        continue;
      }
      if (character === "[" || character === "{" || character === "," || character === ":" || character === ";" || character === "=" || character === "!" || character === "?" || character === "+" || character === "-" || character === "*" || character === "%" || character === "&" || character === "|" || character === "^" || character === "~" || character === "<" || character === ">") {
        canStartRegex = true;
        index += 1;
        continue;
      }
      if (character === "]" || character === "}" || character === ".") {
        canStartRegex = false;
        index += 1;
        continue;
      }
      if (character === "\n") {
        line += 1;
      }
      canStartRegex = false;
      index += 1;
      continue;
    }

    if (character === "\n") {
      line += 1;
    }
    index += 1;
  }

  if (quote !== null) {
    throw new Error("Unterminated string or template literal at line " + line);
  }
  if (templateStack.some(template => template.expressionDepth > 0)) {
    throw new Error("Unterminated template expression at line " + line);
  }

  return comments;
}

export function parseAddedLineMap(diff) {
  const added = new Map();
  let filePath = null;
  let lineNumber = 0;

  for (const rawLine of diff.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("+++ ")) {
      filePath = line.startsWith("+++ b/") ? line.slice(6) : null;
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }

    if (filePath === null) {
      continue;
    }

    if (line.startsWith("+")) {
      if (!added.has(filePath)) {
        added.set(filePath, new Set());
      }
      added.get(filePath).add(lineNumber);
      lineNumber += 1;
    } else if (line.startsWith(" ")) {
      lineNumber += 1;
    }
  }

  return added;
}

function cleanCommentText(comment) {
  return comment.text
    .replace(/^\/\*+/, "")
    .replace(/\*\/$/, "")
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^(?:\/\/|#|--|;|!)\s?/, "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .trim();
}

function isHeaderLicense(comment, source) {
  const prefix = source.slice(0, comment.startOffset).replace(/^#![^\n]*(?:\n|$)/, "");
  return prefix.trim() === "" && /SPDX-License-Identifier:|Copyright|Licensed under|MIT License|Apache License|GNU General Public License/i.test(comment.text);
}

function isPublicApiDoc(comment, source, filePath) {
  if (!javascriptExtensions.has(path.extname(filePath).toLowerCase()) || !comment.text.startsWith("/**")) {
    return false;
  }

  const sourceLines = source.split(/\r?\n/);
  const followingCode = sourceLines.slice(comment.endLine).find(line => line.trim() !== "");
  const exportedDeclaration = followingCode && /^export\s+(?:(?:default|declare|abstract|async)\s+)*(?:function|class|const|let|var|interface|type|enum)\b|^export\s*\{/.test(followingCode.trim());
  const contractTag = /@\s*(?:param|returns?|throws|deprecated)\b/.test(comment.text);
  return Boolean(exportedDeclaration && contractTag);
}

function isFormattingDirective(comment) {
  const text = cleanCommentText(comment);
  if (/^prettier-ignore$/i.test(text)) {
    return true;
  }

  const directive = /^eslint-disable-(?:next-line|line)\s+(.+)$/i.exec(text);
  if (!directive) {
    return false;
  }

  const rules = directive[1].split(/\s*,\s*/);
  return rules.length > 0 && rules.every(rule => ["prettier/prettier", "max-len"].includes(rule));
}

function isExternalLimitationReference(comment) {
  const text = cleanCommentText(comment).replace(/\s+/g, " ");
  if (text.length > 200 || !/^external limitation:\s/i.test(text)) {
    return false;
  }

  const references = [...text.matchAll(/https?:\/\/[^\s<>()]+/gi)];
  if (references.length !== 1 || !/^https:\/\//i.test(references[0][0])) {
    return false;
  }

  const reference = references[0][0].replace(/[.,;!?]+$/, "");
  let url;
  try {
    url = new URL(reference);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const authority = url.href.slice(url.protocol.length + 2).split(/[/?#]/, 1)[0];
  if (url.protocol !== "https:" || authority.includes("@") || url.port ||
      !host.includes(".") || /(^|\.)example\.(?:com|org|net)$/.test(host) ||
      /\.(?:invalid|test|localhost)$/.test(host)) {
    return false;
  }

  const documentationHost = host.startsWith("docs.") ||
    host.startsWith("developer.") ||
    host.endsWith(".readthedocs.io") ||
    host === "nodejs.org";
  const githubIssue = host === "github.com" &&
    /^\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+\/?$/.test(url.pathname);
  const gitlabIssue = host === "gitlab.com" &&
    /^\/[^/]+\/[^/]+\/-\/(?:issues|merge_requests)\/\d+\/?$/.test(url.pathname);
  const rfcReference = (host === "www.rfc-editor.org" &&
    /^\/rfc\/rfc\d+\/?$/i.test(url.pathname)) ||
    (host === "datatracker.ietf.org" &&
    /^\/doc\/html\/rfc\d+\/?$/i.test(url.pathname));

  return documentationHost || githubIssue || gitlabIssue || rfcReference;
}

function isAllowedComment(comment, source, filePath) {
  return isHeaderLicense(comment, source) ||
    isPublicApiDoc(comment, source, filePath) ||
    isFormattingDirective(comment) ||
    isExternalLimitationReference(comment);
}

export function findAddedCommentFindings(filePath, source, addedLines) {
  const spec = commentSpec(filePath);
  if (!spec) {
    return [];
  }

  return collectComments(source, spec)
    .map(comment => {
      const changedLine = [...addedLines].find(number => number >= comment.startLine && number <= comment.endLine);
      return changedLine === undefined || isAllowedComment(comment, source, filePath)
        ? null
        : { file: filePath, line: changedLine, text: cleanCommentText(comment) };
    })
    .filter(Boolean);
}

export function selectDefaultBase({ baseSha, baseRef, hasOriginMain, hasMain, hasLocalChanges }) {
  const base = baseSha ||
    (baseRef ? "origin/" + baseRef : null) ||
    (hasOriginMain ? "origin/main" : null) ||
    (hasMain ? "main" : null) ||
    (hasLocalChanges ? "HEAD" : null);

  if (!base) {
    throw new Error("No base ref found; pass --base <ref-or-sha>");
  }
  return base;
}

function refExists(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parseBase(argv) {
  let base;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--base" || !argv[index + 1]) {
      throw new Error("Usage: node scripts/check-no-comments.mjs [--base <ref-or-sha>]");
    }
    base = argv[index + 1];
    index += 1;
  }

  if (base === undefined) {
    base = selectDefaultBase({
      baseSha: process.env.GITHUB_BASE_SHA,
      baseRef: process.env.GITHUB_BASE_REF,
      hasOriginMain: refExists("origin/main"),
      hasMain: refExists("main"),
      hasLocalChanges: readGitOutput(["status", "--porcelain"]).trim() !== ""
    });
  }

  if (!/^(?:[a-f0-9]{7,40}|[A-Za-z0-9][A-Za-z0-9._/-]{0,127})$/i.test(base) || base.includes("..")) {
    throw new Error("Invalid base ref or SHA");
  }

  return base;
}

function readGitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function addedLinesForUntrackedFiles(added) {
  const files = readGitOutput(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean);

  for (const filePath of files) {
    if (!commentSpec(filePath)) {
      continue;
    }
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      throw new Error("Cannot scan a symbolic link: " + filePath);
    }
    const source = safeRead(filePath);
    const lineCount = source.length === 0 ? 0 : source.split(/\r?\n/).length;
    added.set(filePath, new Set(Array.from({ length: lineCount }, (_, index) => index + 1)));
  }
}

function safeRead(filePath) {
  const root = process.cwd();
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Diff path escapes repository root: " + filePath);
  }
  const realRoot = fs.realpathSync(root);
  const realPath = fs.realpathSync(absolute);
  const realRelative = path.relative(realRoot, realPath);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error("Diff path escapes repository root: " + filePath);
  }
  if (fs.lstatSync(absolute).isSymbolicLink()) {
    throw new Error("Cannot scan a symbolic link: " + filePath);
  }
  return fs.readFileSync(absolute, "utf8");
}

function main() {
  const base = parseBase(process.argv.slice(2));
  const diff = readGitOutput([
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--unified=0",
    "--no-color",
    base,
    "--"
  ]);
  const added = parseAddedLineMap(diff);
  addedLinesForUntrackedFiles(added);

  const findings = [];
  for (const [filePath, lines] of added) {
    if (!commentSpec(filePath)) {
      continue;
    }
    findings.push(...findAddedCommentFindings(filePath, safeRead(filePath), lines));
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(finding.file + ":" + finding.line + ": prohibited comment");
    }
    process.exitCode = 1;
    return;
  }

  console.log("No prohibited comments in added lines against " + base + ".");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
