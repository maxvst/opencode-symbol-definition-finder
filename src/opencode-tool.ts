import { z } from "zod";
import * as path from "path";
import { SymbolFinder } from "./symbolFinder";
import { Formatter } from "./types";
import { FinderErrorCode, FinderResult } from "./types";
import { FileReader } from "./fileReader";
import { NodeFileReader } from "./nodeFileReader";
import { LLMFormatter } from "./formatters/llmFormatter";

export interface ToolDeps {
  readonly fileReader?: FileReader;
  readonly createFinder?: () => SymbolFinder;
  readonly createFormatter?: () => Formatter;
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
    },
    async execute(
      args: { file: string; symbol: string; fragment: string },
      context: { directory: string; worktree: string }
    ): Promise<string> {
      const baseDir = context.directory ?? process.cwd();
      const filePath = path.resolve(baseDir, args.file);

      if (!fileReader.exists(filePath)) {
        const formatter = createFormatter();
        const result: FinderResult = {
          success: false,
          matches: [],
          error: {
            code: FinderErrorCode.FILE_NOT_FOUND,
            details: { file: args.file },
          },
        };
        return formatter.format(result);
      }

      const code = fileReader.read(filePath);
      const finder = createFinder();
      const result = finder.find({
        code,
        symbol: args.symbol,
        fragment: args.fragment,
      });
      const formatter = createFormatter();
      return formatter.format(result);
    },
  };
}

export default createDefinition();
export { createDefinition };
