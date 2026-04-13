import { createPlugin, SEMANTIC_LSP_DESCRIPTION, MapResultCache, formatIssue } from "../src/semantic-lsp-plugin";
import { FinderErrorCode, FinderWarningCode, LspFormattedResult } from "../src/semantic-lsp-transformer/types";

const SAMPLE_CODE = `#include <c.h>

int main() {
    int answer = getUltimateAnswer();
    return answer;
}
 `;

describe("Semantic LSP Plugin - Unit Tests", () => {
  describe("tool.definition hook", () => {
    it("should replace description and parameters for lsp tool", async () => {
      const plugin = createPlugin();
      const output = {
        description: "original description",
        parameters: {
          type: "object",
          properties: {
            operation: { type: "string" },
            filePath: { type: "string" },
            line: { type: "number" },
            character: { type: "number" },
          },
          required: ["operation", "filePath", "line", "character"],
        },
      };

      await plugin["tool.definition"]({ toolID: "lsp" }, output);

      expect(output.description).toBe(SEMANTIC_LSP_DESCRIPTION);
      expect(output.parameters.required).toEqual(["operation", "filePath", "symbol", "fragment"]);
      expect(output.parameters.properties).toHaveProperty("symbol");
      expect(output.parameters.properties).toHaveProperty("fragment");
      expect(output.parameters.properties).not.toHaveProperty("line");
      expect(output.parameters.properties).not.toHaveProperty("character");
    });

    it("should not modify other tools", async () => {
      const plugin = createPlugin();
      const output = {
        description: "original bash description",
        parameters: { type: "object", properties: { command: { type: "string" } } },
      };

      await plugin["tool.definition"]({ toolID: "bash" }, output);

      expect(output.description).toBe("original bash description");
      expect(output.parameters.properties).toHaveProperty("command");
    });
  });

  describe("tool.execute.before hook", () => {
    it("should read file, find symbol, cache result, and replace args", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: (id: string, r: LspFormattedResult) => cachedResults.set(id, r),
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => SAMPLE_CODE,
        createCache: () => cache,
      });

      const output = {
        args: {
          operation: "goToDefinition",
          filePath: "main.cpp",
          symbol: "getUltimateAnswer",
          fragment: "getUltimateAnswer()",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "call1" },
        output,
      );

      expect(output.args).toEqual({
        operation: "goToDefinition",
        filePath: "main.cpp",
        line: 4,
        character: 18,
      });

      expect(cachedResults.has("call1")).toBe(true);
      const cached = cachedResults.get("call1")!;
      expect(cached.errors).toHaveLength(0);
    });

    it("should skip if tool is not lsp", async () => {
      const plugin = createPlugin();
      const output = { args: { command: "ls" } };

      await plugin["tool.execute.before"](
        { tool: "bash", sessionID: "s1", callID: "call1" },
        output,
      );

      expect(output.args).toEqual({ command: "ls" });
    });

    it("should skip if required args are missing", async () => {
      const plugin = createPlugin();
      const output = { args: { operation: "goToDefinition" } };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "call1" },
        output,
      );

      expect(output.args).toEqual({ operation: "goToDefinition" });
    });

    it("should handle file not found with bestEffort", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: (id: string, r: LspFormattedResult) => cachedResults.set(id, r),
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({
        fileExists: () => false,
        readFile: () => "",
        createCache: () => cache,
      });

      const output = {
        args: {
          operation: "goToDefinition",
          filePath: "nonexistent.cpp",
          symbol: "foo",
          fragment: "foo()",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "call2" },
        output,
      );

      expect((output.args as any).line).toBe(1);
      expect((output.args as any).character).toBe(1);

      const cached = cachedResults.get("call2")!;
      expect(cached.errors.length).toBeGreaterThan(0);
    });

    it("should handle symbol not found with bestEffort fallback", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: (id: string, r: LspFormattedResult) => cachedResults.set(id, r),
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => SAMPLE_CODE,
        createCache: () => cache,
      });

      const output = {
        args: {
          operation: "goToDefinition",
          filePath: "main.cpp",
          symbol: "nonExistentSymbol",
          fragment: "nonExistentSymbol()",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "call3" },
        output,
      );

      expect((output.args as any).line).toBe(1);
      expect((output.args as any).character).toBe(1);

      const cached = cachedResults.get("call3")!;
      expect(cached.errors).toHaveLength(1);
      expect(cached.errors[0]!.code).toBe(FinderErrorCode.NO_MATCHES);
    });

    it("should handle multiple matches by returning first match with warning", async () => {
      const multiCode = `int foo() { return 1; }
int bar() { return foo(); }
int baz() { return foo(); }
`;
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: (id: string, r: LspFormattedResult) => cachedResults.set(id, r),
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => multiCode,
        createCache: () => cache,
      });

      const output = {
        args: {
          operation: "goToDefinition",
          filePath: "test.cpp",
          symbol: "foo",
          fragment: "foo",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "call4" },
        output,
      );

      expect((output.args as any).line).toBe(1);
      expect((output.args as any).character).toBe(5);

      const cached = cachedResults.get("call4")!;
      expect(cached.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("tool.execute.after hook", () => {
    it("should completely rewrite output when there are errors", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cachedResult: LspFormattedResult = {
        matches: [],
        errors: [
          {
            code: FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT,
            message: "Symbol not found in fragment",
            cause: "The symbol name does not appear in the provided fragment text.",
            suggestion: "Ensure the fragment parameter contains the exact symbol name.",
          },
        ],
        warnings: [],
      };
      cachedResults.set("call1", cachedResult);

      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: () => {},
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({ createCache: () => cache });
      const output = {
        title: "original title",
        output: "original LSP output",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "call1", args: {} },
        output,
      );

      expect(output.output).toContain("search parameters were specified incorrectly");
      expect(output.output).toContain("search did not produce results");
      expect(output.output).toContain("SYMBOL_NOT_IN_FRAGMENT");
      expect(output.output).not.toContain("original LSP output");
      expect(cachedResults.has("call1")).toBe(false);
    });

    it("should append warning information to output when there are warnings", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cachedResult: LspFormattedResult = {
        matches: [],
        errors: [],
        warnings: [
          {
            code: FinderWarningCode.MULTIPLE_MATCHES,
            message: "Multiple matches found",
            cause: "The symbol was found at 2 locations. Only the first match is returned.",
            suggestion: "Provide a more specific fragment parameter.",
          },
        ],
      };
      cachedResults.set("call2", cachedResult);

      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: () => {},
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({ createCache: () => cache });
      const output = {
        title: "goToDefinition result",
        output: '[{"uri": "file:///c.cpp", "range": {}}]',
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "call2", args: {} },
        output,
      );

      expect(output.output).toContain('[{"uri": "file:///c.cpp"');
      expect(output.output).toContain("query was constructed incorrectly");
      expect(output.output).toContain("MULTIPLE_MATCHES");
      expect(cachedResults.has("call2")).toBe(false);
    });

    it("should not modify output when no errors or warnings", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cachedResult: LspFormattedResult = {
        matches: [{ symbol: "foo", position: { line: 1, column: 1 }, context: "foo()" }],
        errors: [],
        warnings: [],
      };
      cachedResults.set("call3", cachedResult);

      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: () => {},
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({ createCache: () => cache });
      const output = {
        title: "goToDefinition result",
        output: '[{"uri": "file:///c.cpp", "range": {}}]',
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "call3", args: {} },
        output,
      );

      expect(output.output).toBe('[{"uri": "file:///c.cpp", "range": {}}]');
      expect(cachedResults.has("call3")).toBe(false);
    });

    it("should not modify output for non-lsp tools", async () => {
      const plugin = createPlugin();
      const output = {
        title: "bash result",
        output: "file1.txt\nfile2.txt",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "bash", sessionID: "s1", callID: "call4", args: {} },
        output,
      );

      expect(output.output).toBe("file1.txt\nfile2.txt");
    });

    it("should handle missing cache entry gracefully", async () => {
      const plugin = createPlugin();
      const output = {
        title: "goToDefinition result",
        output: "some output",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "unknown", args: {} },
        output,
      );

      expect(output.output).toBe("some output");
    });

    it("should prioritize errors over warnings", async () => {
      const cachedResults: Map<string, LspFormattedResult> = new Map();
      const cachedResult: LspFormattedResult = {
        matches: [],
        errors: [
          {
            code: FinderErrorCode.NO_MATCHES,
            message: "No matches found",
            cause: "Symbol not found.",
            suggestion: "Verify the symbol name.",
          },
        ],
        warnings: [
          {
            code: FinderWarningCode.FRAGMENT_FALLBACK,
            message: "Fragment fallback",
            cause: "Fragment was unusable.",
            suggestion: "Provide a valid fragment.",
          },
        ],
      };
      cachedResults.set("call5", cachedResult);

      const cache = {
        get: (id: string) => cachedResults.get(id),
        set: () => {},
        delete: (id: string) => cachedResults.delete(id),
      };

      const plugin = createPlugin({ createCache: () => cache });
      const output = {
        title: "",
        output: "original output",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "call5", args: {} },
        output,
      );

      expect(output.output).toContain("search parameters were specified incorrectly");
      expect(output.output).toContain("NO_MATCHES");
      expect(output.output).not.toContain("FRAGMENT_FALLBACK");
    });
  });

  describe("MapResultCache", () => {
    it("should store and retrieve values", () => {
      const cache = new MapResultCache();
      const result: LspFormattedResult = { matches: [], errors: [], warnings: [] };

      cache.set("id1", result);
      expect(cache.get("id1")).toBe(result);
      expect(cache.get("id2")).toBeUndefined();
    });

    it("should delete values", () => {
      const cache = new MapResultCache();
      const result: LspFormattedResult = { matches: [], errors: [], warnings: [] };

      cache.set("id1", result);
      cache.delete("id1");
      expect(cache.get("id1")).toBeUndefined();
    });

    it("should handle delete of non-existent key", () => {
      const cache = new MapResultCache();
      expect(() => cache.delete("nonexistent")).not.toThrow();
    });
  });

  describe("formatIssue", () => {
    it("should format an issue with prefix", () => {
      const result = formatIssue("Error", {
        code: "NO_MATCHES",
        message: "No matches found",
        cause: "The symbol was not found.",
        suggestion: "Verify the symbol name.",
      });

      expect(result).toContain("Error [NO_MATCHES]");
      expect(result).toContain("No matches found");
      expect(result).toContain("Cause: The symbol was not found.");
      expect(result).toContain("Suggestion: Verify the symbol name.");
    });
  });
});
