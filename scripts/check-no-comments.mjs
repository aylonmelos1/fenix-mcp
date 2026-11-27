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
  [".tfvars", { line: ["#", "//"], block: [["/*", "*/"]], quotes: ["'", "\""] }],
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
      if (character === "+" || character === "-") {
        const doubled = source[index + 1] === character;
        const postfix = doubled && !canStartRegex;
        canStartRegex = !postfix;
        index += doubled ? 2 : 1;
        continue;
      }
      if (character === "[" || character === "{" || character === "," || character === ":" || character === ";" || character === "=" || character === "!" || character === "?" || character === "*" || character === "%" || character === "&" || character === "|" || character === "^" || character === "~" || character === "<" || character === ">") {
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

function commentContentLines(comment) {
  return comment.text
    .replace(/^\/\*+/, "")
    .replace(/\*\/$/, "")
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*\s?/, "").replace(/^(?:\/\/|#|--|;|!)\s?/, "").trim())
    .filter(Boolean);
}

function isCopyrightHolder(value) {
  const holder = value.trim();
  if (holder.length === 0 || holder.length > 120 ||
      /[!?]$/.test(holder) ||
      (holder.endsWith(".") && !/\b(?:inc|ltd|corp|co|jr|sr|st|llc|gmbh|plc|b\.v|s\.a)\.$/i.test(holder))) {
    return false;
  }

  const tokens = holder.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*\.?/gu) || [];
  const normalizedTokens = tokens.map(token => token.replace(/\.$/, "").toLowerCase());
  const organizationConnectors = new Set(["and", "of", "the", "for", "by", "in", "at"]);
  const personParticles = new Set(["de", "del", "da", "do", "dos", "di", "du", "van", "von", "der", "la", "le"]);
  const organizationSuffixes = new Set(["foundation", "corporation", "corp", "inc", "ltd", "limited", "llc", "gmbh", "plc", "company", "association", "institute", "university", "consortium", "organization", "organisation", "network", "society", "collective", "contributors", "developers", "authors", "team", "group", "project", "initiative", "committee", "community", "conservancy", "laboratory", "laboratories", "labs", "center", "centre", "trust", "council", "board", "union", "department", "office", "museum", "library", "press", "studio", "agency", "club", "school", "church", "enterprises", "holdings", "partners", "partnership", "industries", "systems", "solutions", "technologies"]);
  const narrativeWords = new Set(["this", "that", "these", "those", "file", "text", "source", "when", "because", "must", "should", "shall", "will", "would", "could", "can", "is", "are", "was", "were", "be", "been", "being", "generated", "process", "processes", "processed", "processing", "request", "requests", "requested", "requesting", "maintained", "maintains", "update", "updates", "updated", "preserve", "preserves", "preserved", "stay", "stays", "keep", "keeps", "kept", "include", "includes", "contains", "provides", "requires", "describes", "describe", "refers", "please", "ensure", "ensures", "note", "comments", "expected", "configuration", "documentation", "guidelines", "consistent", "consistency", "better", "best", "valid", "invalid", "important", "necessary", "always", "never", "follow", "follows", "use", "uses", "used", "create", "creates", "created", "made", "make", "makes", "means", "belongs", "belong", "remains", "remain", "represents", "public", "private", "implementation", "detail", "details", "internal", "before", "handle", "handles", "handled", "handling", "return", "returns", "returned", "returning", "with", "cache", "expiration"]);
  const excludedPersonStarts = new Set(["the", "a", "an", "this", "that", "these", "those", "all", "our", "your", "some", "every", "each", "please"]);
  const narrativeSentence = /\b[\p{Lu}][\p{L}\p{N}’'-]*\s+(?:route|routes|routed|routing|handle|handles|handled|handling|process|processes|processed|processing|retrieve|retrieves|retrieved|retrieving|send|sends|sent|sending|return|returns|returned|returning)\s+[\p{Lu}][\p{L}\p{N}’'-]*\s+(?:through|before|after|while|when|using|via)\b/iu;
  const isNameToken = token => {
    const normalized = token.replace(/\.$/, "");
    return /^[\p{Lu}\p{Lt}][\p{L}\p{N}'’.-]*$/u.test(token) ||
      /^[A-Z0-9]{2,}$/u.test(normalized) ||
      /^[a-z][\p{L}\p{N}'’.-]*[A-Z][\p{L}\p{N}'’.-]*$/u.test(normalized);
  };
  if (tokens.length === 0 || tokens.length > 12 ||
      !/^[\p{L}\p{N}.,&'’() -]+$/u.test(holder) ||
      normalizedTokens.some(token => narrativeWords.has(token)) ||
      narrativeSentence.test(holder)) {
    return false;
  }

  const oneWordName = tokens.length === 1 && isNameToken(tokens[0]);
  const hasExtendedPersonalNameCue = tokens.length === 2 ||
    normalizedTokens.some(token => personParticles.has(token)) ||
    tokens.slice(1, -1).some(token => /^[\p{Lu}]\.?$/u.test(token));
  const personalName = tokens.length >= 2 && tokens.length <= 4 &&
    hasExtendedPersonalNameCue &&
    !excludedPersonStarts.has(normalizedTokens[0]) &&
    tokens.every((token, index) => isNameToken(token) ||
      (index > 0 && index < tokens.length - 1 && personParticles.has(normalizedTokens[index])));
  const organizationName = tokens.length >= 2 &&
    organizationSuffixes.has(normalizedTokens.at(-1)) &&
    tokens.every((token, index) => isNameToken(token) ||
      organizationConnectors.has(normalizedTokens[index]) ||
      personParticles.has(normalizedTokens[index]));
  return oneWordName || personalName || organizationName;
}

function isHeaderLicense(comment, source) {
  const prefix = source.slice(0, comment.startOffset).replace(/^#![^\n]*(?:\n|$)/, "");
  if (prefix.trim() !== "") {
    return false;
  }

  const lines = commentContentLines(comment);
  if (lines.length === 0 || lines.length > 8) {
    return false;
  }

  const spdxIdentifier = /^SPDX-License-Identifier:\s+[A-Za-z0-9][A-Za-z0-9.+()-]*(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9][A-Za-z0-9.+()-]*)*$/i;
  const spdxCopyright = /^SPDX-FileCopyrightText:\s+\d{4}(?:-\d{4})?\s+(.+)$/u;
  const copyright = /^Copyright\s+(?:\(c\)|©)?\s*\d{4}(?:-\d{4})?\s+(.+)$/u;
  const validLine = line => {
    if (spdxIdentifier.test(line)) {
      return true;
    }
    const spdxHolder = spdxCopyright.exec(line);
    const copyrightHolder = copyright.exec(line);
    return isCopyrightHolder(spdxHolder?.[1] || copyrightHolder?.[1] || "");
  };
  return lines.some(validLine) && lines.every(validLine);
}

function isPublicApiDoc(comment, source, filePath) {
  if (!javascriptExtensions.has(path.extname(filePath).toLowerCase()) || !comment.text.startsWith("/**") ||
      comment.text.length > 600) {
    return false;
  }

  const sourceLines = source.split(/\r?\n/);
  const followingCode = sourceLines.slice(comment.endLine).find(line => line.trim() !== "");
  const exportedDeclaration = followingCode && /^export\s+(?:(?:default|declare|abstract|async)\s+)*(?:function|class|const|let|var|interface|type|enum)\b|^export\s*\{/.test(followingCode.trim());
  const body = comment.text.slice(3, -2);
  const contractLines = body.split(/\r?\n/)
    .map(line => {
      const content = line.replace(/^\s*\*\s?/, "");
      return { text: content.trim(), indent: content.length - content.trimStart().length };
    })
    .filter(line => line.text);
  const contractTag = /^@(param|returns?|throws|deprecated)\s+\S/;
  const firstTag = contractLines.findIndex(line => contractTag.test(line.text));
  const descriptionLines = firstTag < 0 ? [] : contractLines.slice(0, firstTag);
  const taggedLines = firstTag < 0 ? [] : contractLines.slice(firstTag);
  const narrativeDescription = /\b(?:implementation|internal|private|detail|details|note|remember|important|temporary|currently|workaround|debug|instead|because|must|should|always|never|helper|log|logs|logging|before|after|returning)\b/i;
  const narrativeSubject = /\b(?:function|method|helper|routine|module|class|component)\b/i;
  const apiDescriptionStart = /^(?:returns?|validates?|normalizes?|parses?|resolves?|creates?|builds?|generates?|converts?|encodes?|decodes?|extracts?|formats?|checks?|selects?|provides?|computes?|calculates?)\b/i;
  const descriptionLength = descriptionLines.reduce((length, line) => length + line.text.length, 0);
  const descriptionText = descriptionLines.map(line => line.text).join(" ");
  const descriptionIsContract = descriptionLines.length === 0 ||
    (descriptionLines.length <= 2 && descriptionLength <= 240 &&
      apiDescriptionStart.test(descriptionText) &&
      !narrativeDescription.test(descriptionText) &&
      !narrativeSubject.test(descriptionText));
  const tagDescriptionIsValid = (tagName, text) => {
    const tagMatch = /^@(param|returns?|throws|deprecated)\s+([\s\S]+)$/.exec(text);
    if (!tagMatch) {
      return false;
    }
    let description = tagMatch[2].trim();
    if (tagName === "param") {
      description = description
        .replace(/^\{[^}]+\}\s*/, "")
        .replace(/^\S+\s*/, "")
        .trim();
    } else if (tagName === "returns" || tagName === "return") {
      description = description.replace(/^\{[^}]+\}\s*/, "").trim();
    } else if (tagName === "throws") {
      description = description.startsWith("{")
        ? description.replace(/^\{[^}]+\}\s*/, "").trim()
        : description.replace(/^\S+\s*/, "").trim();
    }
    if (!description) {
      return true;
    }
    const wordCount = (description.match(/[\p{L}\p{N}’'-]+/gu) || []).length;
    const maxWords = tagName === "returns" || tagName === "return" ? 4 :
      tagName === "param" ? 8 : 12;
    return wordCount <= maxWords &&
      !narrativeDescription.test(description) &&
      !/[.!?]\s+[A-Z]/.test(description) &&
      !narrativeSubject.test(description);
  };
  let currentTag = null;
  let continuationLines = 0;
  const taggedLinesValid = taggedLines.every(({ text, indent }) => {
    const tag = contractTag.exec(text);
    if (tag) {
      currentTag = tag[1];
      continuationLines = 0;
      return tagDescriptionIsValid(currentTag, text) &&
        !narrativeDescription.test(text) &&
        !/[.!?]\s+[A-Z]/.test(text);
    }
    if (currentTag !== "param" || indent < 1 || continuationLines >= 2 ||
        text.length > 160 || narrativeDescription.test(text) || /[.!?]\s+[A-Z]/.test(text)) {
      return false;
    }
    continuationLines += 1;
    return true;
  });
  const conciseContract = firstTag >= 0 && contractLines.length <= 12 &&
    descriptionIsContract &&
    taggedLinesValid;
  return Boolean(exportedDeclaration && conciseContract);
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

const externalIssueSourceLabels = new Map([
  ["modelcontextprotocol/typescript-sdk", new Set(["mcpsdk"])],
  ["motdotla/dotenv", new Set(["dotenv"])],
  ["brianc/node-postgres", new Set(["pg", "nodepostgres"])],
  ["salesforce/tough-cookie", new Set(["toughcookie"])],
  ["colinhacks/zod", new Set(["zod"])]
]);

const externalDocumentationSourceLabels = new Map([
  ["developer.mozilla.org", new Set(["javascript", "mdn", "webapi"])],
  ["docs.github.com", new Set(["github", "githubactions", "githubrestapi"])],
  ["docs.npmjs.com", new Set(["npm", "npmcli"])],
  ["nodejs.org", new Set(["nodejs"])]
]);

function normalizeSourceLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsProhibitedMarker(comment) {
  const text = cleanCommentText(comment);
  return /\b(?:TODO|FIXME|HACK|IMPORTANT)\b|temporarily|temporary|temporário|temporária|temporariamente|do not remove|don't remove|não remova|não mexa aqui/i.test(text);
}

function isExternalLimitationReference(comment) {
  const text = cleanCommentText(comment).replace(/\s+/g, " ");
  if (text.length > 200) {
    return false;
  }

  const references = [...text.matchAll(/https?:\/\/[^\s<>()]+/gi)];
  if (references.length !== 1) {
    return false;
  }

  const referenceMatch = references[0];
  const reference = referenceMatch[0].replace(/[.,;!?]+$/, "");
  const beforeReference = text.slice(0, referenceMatch.index).trim();
  const afterReference = text.slice(referenceMatch.index + referenceMatch[0].length).trim();
  if (!beforeReference.endsWith(";") || (afterReference && !/^[.,;!?]+$/.test(afterReference))) {
    return false;
  }

  const limitation = /^external limitation:\s*([^:;]{2,40}):\s*behavior:\s*([^;]+);\s*impact:\s*(.+)$/i.exec(beforeReference.slice(0, -1).trim());
  if (!limitation) {
    return false;
  }

  const behavior = limitation[2].trim();
  const impact = limitation[3].trim();
  const behaviorWords = behavior.match(/[\p{L}\p{N}]+/gu) || [];
  const impactWords = impact.match(/[\p{L}\p{N}]+/gu) || [];
  if (behavior.length < 20 || behaviorWords.length < 5 ||
      impact.length < 20 || impactWords.length < 5) {
    return false;
  }

  const sourceLabel = normalizeSourceLabel(limitation[1]);
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

  const documentationSources = externalDocumentationSourceLabels.get(host);
  const documentationLabelMatches = documentationSources?.has(sourceLabel) === true;
  const documentationPathMatches =
    (host === "developer.mozilla.org" && /^\/(?:en-US|en)\/docs\/.+/.test(url.pathname)) ||
    (host === "docs.github.com" && /^\/en\/(?:rest|actions|packages|repositories)(?:\/|$)/.test(url.pathname)) ||
    (host === "docs.npmjs.com" && /^\/(?:cli|commands|using-npm|about-npm)(?:\/|$)/.test(url.pathname)) ||
    (host === "nodejs.org" && /^\/api\/.+/.test(url.pathname));
  const githubIssue = host === "github.com" &&
    /^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/\d+\/?$/.exec(url.pathname);
  const issueRepository = githubIssue ? (githubIssue[1] + "/" + githubIssue[2]).toLowerCase() : null;
  const issueSources = issueRepository ? externalIssueSourceLabels.get(issueRepository) : null;
  const issueLabelMatches = issueSources?.has(sourceLabel) === true;
  const rfcSource = /^rfc\d+$/i.test(sourceLabel) || sourceLabel === "ietf";
  const rfcReference = rfcSource
    ? (host === "www.rfc-editor.org" && /^\/rfc\/rfc\d+\/?$/i.test(url.pathname)) ||
      (host === "datatracker.ietf.org" && /^\/doc\/html\/rfc\d+\/?$/i.test(url.pathname))
    : false;

  return (documentationLabelMatches && documentationPathMatches) || issueLabelMatches || rfcReference;
}

export function findExternalLimitationReviewRequirements(filePath, source, addedLines) {
  const spec = commentSpec(filePath);
  if (!spec) {
    return [];
  }

  return collectComments(source, spec).flatMap(comment => {
    const changedLine = [...addedLines].find(number => number >= comment.startLine && number <= comment.endLine);
    return changedLine === undefined || !isExternalLimitationReference(comment)
      ? []
      : [{
          file: filePath,
          line: changedLine,
          text: cleanCommentText(comment),
          reason: "Verify that the cited source supports the stated behavior and impact."
        }];
  });
}

function isAllowedComment(comment, source, filePath) {
  if (containsProhibitedMarker(comment)) {
    return false;
  }
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
  const externalReviewRequirements = [];
  for (const [filePath, lines] of added) {
    if (!commentSpec(filePath)) {
      continue;
    }
    const source = safeRead(filePath);
    findings.push(...findAddedCommentFindings(filePath, source, lines));
    externalReviewRequirements.push(...findExternalLimitationReviewRequirements(filePath, source, lines));
  }

  if (externalReviewRequirements.length > 0) {
    console.warn("Human review required: an allowlisted source URL does not verify the stated limitation.");
    for (const requirement of externalReviewRequirements) {
      console.warn(requirement.file + ":" + requirement.line + ": verify the behavior and impact against the cited source.");
    }
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
