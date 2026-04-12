import { z } from "zod";
import * as path from "path";
import { SymbolFinder } from "./symbolFinder";
import { Formatter, FinderResult, FinderErrorCode, SymbolMatch } from "./types";
import { FileReader } from "./fileReader";
import { NodeFileReader } from "./nodeFileReader";
import { LLMFormatter } from "./formatters/llmFormatter";

export interface ToolDeps {
  readonly fileReader?: FileReader;
  readonly createFinder?: () => SymbolFinder;
  readonly createFormatter?: () => Formatter<unknown>;
}

function createDefaultDeps(): Required<ToolDeps> {
  return {
    fileReader: new NodeFileReader(),
    createFinder: () => new SymbolFinder(),
    createFormatter: () => new LLMFormatter(),
  };
}

function createDefinition(deps?: ToolDeps) {
  const { fileReader, createFinder, createFormatter } = {
    ...createDefaultDeps(),
    ...deps,
  };

  return {
    description:
      "Finds occurrences of a symbol in a source code file. Given a file path, a symbol name, and a code fragment containing the symbol, locates all matching positions in the file and returns structured information about each match.",
    args: {
      file: z
        .string()
        .describe(
          "Path to the source code file relative to the project directory"
        ),
      symbol: z
        .string()
        .describe(
          "Symbol name to search for (e.g. function, variable, or class name)"
        ),
      fragment: z
        .string()
        .describe(
          "Code fragment containing the symbol, used to disambiguate between multiple occurrences"
        ),
      bestEffort: z
        .boolean()
        .optional()
        .describe(
          "When true, always returns exactly one position even if input is incomplete or ambiguous. Returns the best available match with warnings."
        ),
    },
    async execute(
      args: { file: string; symbol: string; fragment: string; bestEffort?: boolean },
      context: { directory: string; worktree: string }
    ): Promise<string> {
      const baseDir = context.directory ?? process.cwd();
      const filePath = path.resolve(baseDir, args.file);
      const formatter = createFormatter();

      if (!fileReader.exists(filePath)) {
        if (args.bestEffort) {
          const fallbackMatch: SymbolMatch = {
            symbol: '',
            position: { line: 1, column: 1 },
            context: '',
          };
          const result: FinderResult = {
            matches: [fallbackMatch],
            errors: [{ code: FinderErrorCode.FILE_NOT_FOUND, details: { file: args.file } }],
            warnings: [],
          };
          return formatOutput(formatter, result);
        }

        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.FILE_NOT_FOUND, details: { file: args.file } }],
          warnings: [],
        };
        return formatOutput(formatter, result);
      }

      const code = fileReader.read(filePath);
      const finder = createFinder();
      const result = finder.find({
        code,
        symbol: args.symbol,
        fragment: args.fragment,
        bestEffort: args.bestEffort,
      });
      return formatOutput(formatter, result);
    },
  };
}

export default createDefinition();
export { createDefinition };

function formatOutput(formatter: Formatter<unknown>, result: FinderResult): string {
  const output = formatter.format(result);
  return typeof output === 'string' ? output : JSON.stringify(output);
}
