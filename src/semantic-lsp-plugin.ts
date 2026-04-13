import * as fs from "fs";
import * as path from "path";
import { SemanticLspTransformer } from "./semantic-lsp-transformer/SemanticLspTransformer";
import { LspFormatter } from "./semantic-lsp-transformer/formatters/lspFormatter";
import {
  LspFormattedResult,
  LspFormattedIssue,
  FinderResult,
} from "./semantic-lsp-transformer/types";

const TOOL_ID = "lsp";

const SEMANTIC_LSP_DESCRIPTION = `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

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

interface SemanticLspResultCache {
  get(callID: string): LspFormattedResult | undefined;
  set(callID: string, result: LspFormattedResult): void;
  delete(callID: string): void;
}

class MapResultCache implements SemanticLspResultCache {
  private readonly cache = new Map<string, LspFormattedResult>();

  get(callID: string): LspFormattedResult | undefined {
    return this.cache.get(callID);
  }

  set(callID: string, result: LspFormattedResult): void {
    this.cache.set(callID, result);
  }

  delete(callID: string): void {
    this.cache.delete(callID);
  }
}

export interface SemanticLspPluginDeps {
  readonly fileExists?: (filePath: string) => boolean;
  readonly readFile?: (filePath: string) => string;
  readonly createFinder?: () => SemanticLspTransformer;
  readonly createFormatter?: () => LspFormatter;
  readonly createCache?: () => SemanticLspResultCache;
  readonly getDirectory?: () => string;
}

function createDefaultDeps(): Required<SemanticLspPluginDeps> {
  return {
    fileExists: (filePath: string) => fs.existsSync(filePath),
    readFile: (filePath: string) => fs.readFileSync(filePath, "utf-8"),
    createFinder: () => new SemanticLspTransformer(),
    createFormatter: () => new LspFormatter(),
    createCache: () => new MapResultCache(),
    getDirectory: () => process.cwd(),
  };
}

interface ToolDefinitionInput {
  toolID: string;
}

interface ToolDefinitionOutput {
  description: string;
  parameters: any;
}

interface ToolExecuteBeforeInput {
  tool: string;
  sessionID: string;
  callID: string;
}

interface ToolExecuteBeforeOutput {
  args: any;
}

interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: any;
}

interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: any;
}

export interface SemanticLspHooks {
  "tool.definition": (input: ToolDefinitionInput, output: ToolDefinitionOutput) => Promise<void>;
  "tool.execute.before": (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void>;
  "tool.execute.after": (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
}

export function createPlugin(deps?: SemanticLspPluginDeps): SemanticLspHooks {
  const d = { ...createDefaultDeps(), ...deps };
  const cache = d.createCache();
  const finder = d.createFinder();
  const formatter = d.createFormatter();

  const toolDefinitionHook: SemanticLspHooks["tool.definition"] = async (input, output) => {
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
            "outgoingCalls",
          ],
          description: "The LSP operation to perform",
        },
        filePath: {
          type: "string",
          description: "The absolute or relative path to the file",
        },
        symbol: {
          type: "string",
          description:
            "The symbol name (e.g. function, variable, or class name)",
        },
        fragment: {
          type: "string",
          description:
            "A code snippet containing the symbol to disambiguate between multiple occurrences",
        },
      },
      required: ["operation", "filePath", "symbol", "fragment"],
    };
  };

  const toolExecuteBeforeHook: SemanticLspHooks["tool.execute.before"] = async (input, output) => {
    if (input.tool !== TOOL_ID) return;

    const args = output.args as {
      filePath?: string;
      symbol?: string;
      fragment?: string;
      operation?: string;
    };

    if (!args.filePath || !args.symbol || !args.fragment) return;

    const baseDir = d.getDirectory();
    const filePath = path.resolve(baseDir, args.filePath);

    let code = "";
    if (d.fileExists(filePath)) {
      code = d.readFile(filePath);
    }

    const finderResult: FinderResult = finder.find({
      code,
      symbol: args.symbol,
      fragment: args.fragment,
      bestEffort: true,
    });

    const lspResult = formatter.format(finderResult);
    cache.set(input.callID, lspResult);

    const match = finderResult.matches[0];
    output.args = {
      operation: args.operation,
      filePath: args.filePath,
      line: match ? match.position.line : 1,
      character: match ? match.position.column : 1,
    };
  };

  const toolExecuteAfterHook: SemanticLspHooks["tool.execute.after"] = async (input, output) => {
    if (input.tool !== TOOL_ID) return;

    const cached = cache.get(input.callID);
    cache.delete(input.callID);

    if (!cached) return;

    if (cached.errors.length > 0) {
      const errorMessages = cached.errors
        .map((e: LspFormattedIssue) => formatIssue("Error", e))
        .join("\n\n");
      output.output =
        `The search parameters were specified incorrectly and the search did not produce results.\n\n` +
        errorMessages;
      return;
    }

    if (cached.warnings.length > 0) {
      const warningMessages = cached.warnings
        .map((w: LspFormattedIssue) => formatIssue("Warning", w))
        .join("\n\n");
      output.output +=
        `\n\n---\n**Note:** The query was constructed incorrectly, so the accuracy of the result is not guaranteed.\n\n` +
        warningMessages;
    }
  };

  return {
    "tool.definition": toolDefinitionHook,
    "tool.execute.before": toolExecuteBeforeHook,
    "tool.execute.after": toolExecuteAfterHook,
  };
}

function formatIssue(prefix: string, issue: LspFormattedIssue): string {
  return `${prefix} [${issue.code}]: ${issue.message}\nCause: ${issue.cause}\nSuggestion: ${issue.suggestion}`;
}

export { SEMANTIC_LSP_DESCRIPTION, formatIssue, MapResultCache };
export type { SemanticLspResultCache };

export default {
  server: async (input: { directory: string }) => {
    return createPlugin({ getDirectory: () => input.directory });
  },
};
