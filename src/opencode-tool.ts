import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { SymbolFinder } from "./symbolFinder";
import { LLMFormatter } from "./formatters/llmFormatter";

const definition = {
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

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    const code = fs.readFileSync(filePath, "utf-8");
    const finder = new SymbolFinder();
    const result = finder.find({
      code,
      symbol: args.symbol,
      fragment: args.fragment,
    });
    const formatter = new LLMFormatter();
    return formatter.format(result);
  },
};

export default definition;
