// src/semantic-lsp-plugin.ts
import * as fs from "fs";
import * as path from "path";

// src/semantic-lsp-transformer/validation/ValidationChain.ts
var ValidationChain = class {
  constructor(validators) {
    this.validators = validators;
  }
  validate(options) {
    for (const validator of this.validators) {
      const error = validator.validate(options);
      if (error !== null) {
        return error;
      }
    }
    return null;
  }
};

// src/semantic-lsp-transformer/validation/EmptyCodeValidator.ts
var EmptyCodeValidator = class {
  validate(options) {
    if (!options.code || options.code.trim().length === 0) {
      return { code: "EMPTY_CODE" /* EMPTY_CODE */ };
    }
    return null;
  }
};

// src/semantic-lsp-transformer/validation/EmptySymbolValidator.ts
var EmptySymbolValidator = class {
  validate(options) {
    if (!options.symbol || options.symbol.trim().length === 0) {
      return { code: "EMPTY_SYMBOL" /* EMPTY_SYMBOL */ };
    }
    return null;
  }
};

// src/semantic-lsp-transformer/validation/EmptyFragmentValidator.ts
var EmptyFragmentValidator = class {
  validate(options) {
    if (!options.fragment || options.fragment.trim().length === 0) {
      return { code: "EMPTY_FRAGMENT" /* EMPTY_FRAGMENT */ };
    }
    return null;
  }
};

// src/semantic-lsp-transformer/validation/InvalidSymbolValidator.ts
var InvalidSymbolValidator = class {
  validate(options) {
    const symbol = options.symbol;
    const trimmed = symbol.trim();
    if (trimmed !== symbol) {
      return { code: "INVALID_SYMBOL" /* INVALID_SYMBOL */ };
    }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
      return { code: "INVALID_SYMBOL" /* INVALID_SYMBOL */ };
    }
    return null;
  }
};

// src/semantic-lsp-transformer/utils/textNormalizer.ts
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeForComparison(text) {
  return text.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s*\(\s*/g, "(").replace(/\s*\)\s*/g, ")").replace(/\s*\{\s*/g, "{").replace(/\s*\}\s*/g, "}").replace(/\s*=\s*/g, "=").replace(/\s*:\s*/g, ":").replace(/\s*;\s*/g, ";").trim();
}

// src/semantic-lsp-transformer/validation/SymbolInFragmentValidator.ts
var SymbolInFragmentValidator = class {
  validate(options) {
    const symbolPattern = `\\b${escapeRegExp(options.symbol)}\\b`;
    const symbolRegex = new RegExp(symbolPattern);
    if (!symbolRegex.test(options.fragment)) {
      return { code: "SYMBOL_NOT_IN_FRAGMENT" /* SYMBOL_NOT_IN_FRAGMENT */ };
    }
    const globalRegex = new RegExp(symbolPattern, "g");
    const fragmentMatches = options.fragment.match(globalRegex);
    if (!fragmentMatches || fragmentMatches.length !== 1) {
      return { code: "SYMBOL_NOT_UNIQUE_IN_FRAGMENT" /* SYMBOL_NOT_UNIQUE_IN_FRAGMENT */ };
    }
    return null;
  }
};

// src/semantic-lsp-transformer/search/RegexSearchStrategy.ts
var RegexSearchStrategy = class {
  search(code, symbol, fragment, contextLines) {
    const symbolPattern = `\\b${escapeRegExp(symbol)}\\b`;
    const symbolRegex = new RegExp(symbolPattern, "g");
    const lines = code.split(/\r?\n/);
    const originalOccurrences = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      symbolRegex.lastIndex = 0;
      let match;
      while ((match = symbolRegex.exec(line)) !== null) {
        originalOccurrences.push({
          line: lineIndex + 1,
          column: match.index + 1
        });
      }
    }
    if (!fragment || fragment.trim().length === 0) {
      return this.buildMatchesFromOccurrences(originalOccurrences, symbol, lines, contextLines);
    }
    const normalizedCode = normalizeForComparison(code);
    const normalizedFragment = normalizeForComparison(fragment);
    const symbolOffsetInFragment = this.findSymbolOffset(normalizedFragment, symbolRegex);
    if (symbolOffsetInFragment < 0) {
      return this.buildMatchesFromOccurrences(originalOccurrences, symbol, lines, contextLines);
    }
    const normalizedSymbolPositions = this.findAllPositions(normalizedCode, symbolRegex);
    const matches = [];
    for (let i = 0; i < normalizedSymbolPositions.length; i++) {
      const symbolPos = normalizedSymbolPositions[i];
      const candidateStart = symbolPos - symbolOffsetInFragment;
      if (candidateStart < 0) continue;
      if (normalizedCode.startsWith(normalizedFragment, candidateStart) && i < originalOccurrences.length) {
        const orig = originalOccurrences[i];
        matches.push({
          symbol,
          position: { line: orig.line, column: orig.column },
          context: this.extractContext(lines, orig.line - 1, contextLines)
        });
      }
    }
    return this.deduplicateMatches(matches);
  }
  buildMatchesFromOccurrences(occurrences, symbol, lines, contextLines) {
    return this.deduplicateMatches(
      occurrences.map((occ) => ({
        symbol,
        position: { line: occ.line, column: occ.column },
        context: this.extractContext(lines, occ.line - 1, contextLines)
      }))
    );
  }
  findSymbolOffset(text, regex) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    return match !== null ? match.index : -1;
  }
  findAllPositions(text, regex) {
    const positions = [];
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index);
    }
    return positions;
  }
  extractContext(lines, lineIndex, contextLines) {
    const startLine = Math.max(0, lineIndex - contextLines);
    const endLine = Math.min(lines.length - 1, lineIndex + contextLines);
    const contextParts = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      if (line !== void 0) {
        contextParts.push(line);
      }
    }
    return contextParts.join("\n");
  }
  deduplicateMatches(matches) {
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const match of matches) {
      const key = `${match.position.line}:${match.position.column}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }
    return unique;
  }
};

// src/semantic-lsp-transformer/SemanticLspTransformer.ts
var DEFAULT_CONTEXT_LINES = 3;
var FALLBACK_POSITION = { line: 1, column: 1 };
function createDefaultValidators() {
  return new ValidationChain([
    new EmptyCodeValidator(),
    new EmptySymbolValidator(),
    new EmptyFragmentValidator(),
    new InvalidSymbolValidator(),
    new SymbolInFragmentValidator()
  ]);
}
var SemanticLspTransformer = class {
  constructor(options = {}) {
    const { contextLines, validator, searchStrategy } = options;
    this.contextLines = contextLines ?? DEFAULT_CONTEXT_LINES;
    this.validator = validator ?? createDefaultValidators();
    this.searchStrategy = searchStrategy ?? new RegexSearchStrategy();
  }
  find(options) {
    if (options.bestEffort) {
      return this.findBestEffort(options);
    }
    const error = this.validator.validate(options);
    if (error !== null) {
      return { matches: [], errors: [error], warnings: [] };
    }
    const matches = this.searchStrategy.search(
      options.code,
      options.symbol,
      options.fragment,
      this.contextLines
    );
    return { matches, errors: [], warnings: [] };
  }
  findBestEffort(options) {
    const errors = [];
    const warnings = [];
    if (!options.code || options.code.trim().length === 0) {
      return {
        matches: [this.createFallbackMatch("")],
        errors: [{ code: "EMPTY_CODE" /* EMPTY_CODE */ }],
        warnings: []
      };
    }
    if (!options.symbol || options.symbol.trim().length === 0) {
      return {
        matches: [this.createFallbackMatch(options.code)],
        errors: [{ code: "EMPTY_SYMBOL" /* EMPTY_SYMBOL */ }],
        warnings: []
      };
    }
    let effectiveFragment = options.fragment;
    const trimmedFragment = effectiveFragment?.trim() ?? "";
    if (trimmedFragment.length === 0) {
      warnings.push({
        code: "FRAGMENT_FALLBACK" /* FRAGMENT_FALLBACK */,
        details: { reason: "EMPTY_FRAGMENT" }
      });
      effectiveFragment = void 0;
    } else {
      const symbolPattern = `\\b${escapeRegExp(options.symbol)}\\b`;
      const symbolRegex = new RegExp(symbolPattern);
      if (!symbolRegex.test(trimmedFragment)) {
        warnings.push({
          code: "FRAGMENT_FALLBACK" /* FRAGMENT_FALLBACK */,
          details: { reason: "SYMBOL_NOT_IN_FRAGMENT" }
        });
        effectiveFragment = void 0;
      }
    }
    const matches = this.searchStrategy.search(
      options.code,
      options.symbol,
      effectiveFragment,
      this.contextLines
    );
    if (matches.length === 0) {
      errors.push({ code: "NO_MATCHES" /* NO_MATCHES */ });
      return {
        matches: [this.createFallbackMatch(options.code)],
        errors,
        warnings
      };
    }
    if (matches.length > 1) {
      warnings.push({
        code: "MULTIPLE_MATCHES" /* MULTIPLE_MATCHES */,
        details: {
          totalMatches: matches.length,
          lines: matches.map((m) => m.position.line).join(",")
        }
      });
    }
    return {
      matches: [matches[0]],
      errors,
      warnings
    };
  }
  createFallbackMatch(code) {
    const contextLines = code.split(/\r?\n/).slice(0, 7).join("\n");
    return {
      symbol: "",
      position: FALLBACK_POSITION,
      context: contextLines
    };
  }
};

// src/semantic-lsp-transformer/formatters/lspFormatter.ts
var LspFormatter = class {
  format(result) {
    return {
      matches: result.matches.map((m) => ({
        symbol: m.symbol,
        position: { line: m.position.line, column: m.position.column },
        context: m.context
      })),
      errors: result.errors.map((e) => this.formatError(e)),
      warnings: result.warnings.map((w) => this.formatWarning(w))
    };
  }
  formatError(error) {
    switch (error.code) {
      case "FILE_NOT_FOUND" /* FILE_NOT_FOUND */:
        return {
          code: error.code,
          message: "File not found",
          cause: `The file "${error.details?.["file"] ?? "unknown"}" does not exist or is not accessible from the project directory.`,
          suggestion: 'Verify the file path is correct relative to the project directory. Use tools such as "list directory" or "search files" to locate the file, then retry with the correct path.'
        };
      case "EMPTY_CODE" /* EMPTY_CODE */:
        return {
          code: error.code,
          message: "Code is empty",
          cause: "The resolved file is empty or does not contain any source code.",
          suggestion: 'Provide a valid file path in the "file" parameter that points to a file containing source code.'
        };
      case "EMPTY_SYMBOL" /* EMPTY_SYMBOL */:
        return {
          code: error.code,
          message: "Symbol is empty",
          cause: 'The "symbol" parameter was provided as an empty string.',
          suggestion: 'Provide a valid symbol name (function, variable, or class name) in the "symbol" parameter. Example: "myFunction".'
        };
      case "EMPTY_FRAGMENT" /* EMPTY_FRAGMENT */:
        return {
          code: error.code,
          message: "Fragment is empty",
          cause: 'The "fragment" parameter was provided as an empty string.',
          suggestion: 'Provide a code snippet containing the symbol in the "fragment" parameter to disambiguate between multiple occurrences. Example: "myFunction(arg1, arg2)".'
        };
      case "INVALID_SYMBOL" /* INVALID_SYMBOL */:
        return {
          code: error.code,
          message: "Symbol contains invalid characters",
          cause: 'The "symbol" parameter contains spaces, parentheses, brackets, or other characters that are not valid in an identifier.',
          suggestion: 'Pass only the symbol name using valid identifier characters (letters, digits, underscore, dollar sign). For example, use "myFunction" instead of "myFunction()" or " obj.method" .'
        };
      case "SYMBOL_NOT_IN_FRAGMENT" /* SYMBOL_NOT_IN_FRAGMENT */:
        return {
          code: error.code,
          message: "Symbol not found in fragment",
          cause: "The symbol name does not appear in the provided fragment text.",
          suggestion: 'Ensure the "fragment" parameter contains the exact symbol name specified in the "symbol" parameter. For example, if symbol is "foo", the fragment must include "foo" as a substring.'
        };
      case "SYMBOL_NOT_UNIQUE_IN_FRAGMENT" /* SYMBOL_NOT_UNIQUE_IN_FRAGMENT */:
        return {
          code: error.code,
          message: "Symbol appears multiple times in fragment",
          cause: "The symbol occurs more than once within the fragment, making it impossible to uniquely identify the target occurrence.",
          suggestion: "Provide a larger or more specific fragment where the symbol appears exactly once. Include surrounding context lines so the correct occurrence can be uniquely identified."
        };
      case "NO_MATCHES" /* NO_MATCHES */:
        return {
          code: error.code,
          message: "No matches found",
          cause: "The symbol was not found at any position in the file that matches the given fragment.",
          suggestion: 'Verify the symbol name and fragment are correct and that the file contains the expected code. If the file does not contain the expected code, use other tools such as "read file" or "search in files" to locate the symbol.'
        };
    }
  }
  formatWarning(warning) {
    switch (warning.code) {
      case "MULTIPLE_MATCHES" /* MULTIPLE_MATCHES */:
        return {
          code: warning.code,
          message: "Multiple matches found",
          cause: `The symbol was found at ${warning.details?.["totalMatches"] ?? "multiple"} locations (lines: ${warning.details?.["lines"] ?? "unknown"}). Only the first match is returned.`,
          suggestion: 'Provide a more specific "fragment" parameter that uniquely identifies the desired occurrence. Include additional surrounding code so that only one location matches.'
        };
      case "FRAGMENT_FALLBACK" /* FRAGMENT_FALLBACK */:
        return {
          code: warning.code,
          message: "Fragment fallback",
          cause: `The fragment was unusable (reason: ${warning.details?.["reason"] ?? "unknown"}). The search was performed by symbol name only, which may return an imprecise result.`,
          suggestion: 'Provide a valid "fragment" parameter containing the symbol to improve match accuracy. If the fragment was empty, include the code snippet. If the symbol was absent from the fragment, ensure it contains the exact symbol name.'
        };
    }
  }
};

// src/semantic-lsp-plugin.ts
var TOOL_ID = "lsp";
var SEMANTIC_LSP_DESCRIPTION = `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

Required parameters:
- filePath: The file to operate on
- operation: The LSP operation to perform
- symbol: The symbol name (e.g. function, variable, or class name)
- fragment: A code snippet containing the symbol to disambiguate between multiple occurrences

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.`;
var MapResultCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
  }
  get(callID) {
    return this.cache.get(callID);
  }
  set(callID, result) {
    this.cache.set(callID, result);
  }
  delete(callID) {
    this.cache.delete(callID);
  }
};
function createDefaultDeps() {
  return {
    fileExists: (filePath) => fs.existsSync(filePath),
    readFile: (filePath) => fs.readFileSync(filePath, "utf-8"),
    createFinder: () => new SemanticLspTransformer(),
    createFormatter: () => new LspFormatter(),
    createCache: () => new MapResultCache(),
    getDirectory: () => process.cwd()
  };
}
function createPlugin(deps) {
  const d = { ...createDefaultDeps(), ...deps };
  const cache = d.createCache();
  const finder = d.createFinder();
  const formatter = d.createFormatter();
  const toolDefinitionHook = async (input, output) => {
    if (input.toolID !== TOOL_ID) return;
    output.description = SEMANTIC_LSP_DESCRIPTION;
    output.parameters = {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "goToDefinition",
            "findReferences",
            "hover",
            "documentSymbol",
            "workspaceSymbol",
            "goToImplementation",
            "prepareCallHierarchy",
            "incomingCalls",
            "outgoingCalls"
          ],
          description: "The LSP operation to perform"
        },
        filePath: {
          type: "string",
          description: "The absolute or relative path to the file"
        },
        symbol: {
          type: "string",
          description: "The symbol name (e.g. function, variable, or class name)"
        },
        fragment: {
          type: "string",
          description: "A code snippet containing the symbol to disambiguate between multiple occurrences"
        }
      },
      required: ["operation", "filePath", "symbol", "fragment"]
    };
    output.jsonSchema = output.parameters;
  };
  const toolExecuteBeforeHook = async (input, output) => {
    if (input.tool !== TOOL_ID) return;
    if (!output.args || typeof output.args !== "object") return;
    const args = output.args;
    if (!args.filePath) return;
    const rawLine = typeof args.line === "number" && Number.isFinite(args.line) ? args.line : void 0;
    const rawCharacter = typeof args.character === "number" && Number.isFinite(args.character) ? args.character : void 0;
    const baseDir = d.getDirectory();
    const filePath = path.resolve(baseDir, args.filePath);
    let code = "";
    if (d.fileExists(filePath)) {
      code = d.readFile(filePath);
    }
    const finderResult = finder.find({
      code,
      symbol: args.symbol ?? "",
      fragment: args.fragment ?? "",
      bestEffort: true
    });
    const lspResult = formatter.format(finderResult);
    cache.set(input.callID, lspResult);
    const resolved = finderResult.errors.length === 0 ? finderResult.matches[0] : void 0;
    delete output.args.symbol;
    delete output.args.fragment;
    output.args.operation = args.operation;
    output.args.filePath = args.filePath;
    output.args.line = resolved ? resolved.position.line : rawLine ?? 1;
    output.args.character = resolved ? resolved.position.column : rawCharacter ?? 1;
  };
  const toolExecuteAfterHook = async (input, output) => {
    if (input.tool !== TOOL_ID) return;
    const cached = cache.get(input.callID);
    cache.delete(input.callID);
    if (!cached) return;
    if (cached.errors.length > 0) {
      const errorMessages = cached.errors.map((e) => formatIssue("Error", e)).join("\n\n");
      output.output = `The search parameters were specified incorrectly and the search did not produce results.

` + errorMessages;
      return;
    }
    if (cached.warnings.length > 0) {
      const warningMessages = cached.warnings.map((w) => formatIssue("Warning", w)).join("\n\n");
      output.output += `

---
**Note:** The query was constructed incorrectly, so the accuracy of the result is not guaranteed.

` + warningMessages;
    }
  };
  return {
    "tool.definition": toolDefinitionHook,
    "tool.execute.before": toolExecuteBeforeHook,
    "tool.execute.after": toolExecuteAfterHook
  };
}
function formatIssue(prefix, issue) {
  return `${prefix} [${issue.code}]: ${issue.message}
Cause: ${issue.cause}
Suggestion: ${issue.suggestion}`;
}
var semantic_lsp_plugin_default = {
  id: "semantic-lsp",
  server: async (input) => {
    return createPlugin({ getDirectory: () => input.directory });
  }
};
export {
  MapResultCache,
  SEMANTIC_LSP_DESCRIPTION,
  createPlugin,
  semantic_lsp_plugin_default as default,
  formatIssue
};
