import * as path from "path";
import * as fs from "fs";
import { createPlugin } from "../../src/semantic-lsp-plugin";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

const CPP_CODE = `#include <iostream>

int add(int a, int b) {
    return a + b;
}

int main() {
    int result = add(1, 2);
    std::cout << result << std::endl;
    return 0;
}
`;

describe("Semantic LSP Plugin - Integration Tests", () => {
  describe("full pipeline: definition -> before -> after", () => {
    it("should complete the full pipeline for a successful symbol search", async () => {
      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => CPP_CODE,
        getDirectory: () => "/project",
      });

      const defOutput = {
        description: "original lsp description",
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

      await plugin["tool.definition"]({ toolID: "lsp" }, defOutput);
      expect(defOutput.parameters.required).toContain("symbol");
      expect(defOutput.parameters.required).toContain("fragment");

      const beforeOutput = {
        args: {
          operation: "goToDefinition",
          filePath: "test.cpp",
          symbol: "add",
          fragment: "add(1, 2)",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-1" },
        beforeOutput,
      );

      const beforeArgs = beforeOutput.args as any;
      expect(beforeArgs.line).toBe(8);
      expect(beforeArgs.character).toBe(18);
      expect(beforeArgs.operation).toBe("goToDefinition");
      expect(beforeArgs.filePath).toBe("test.cpp");

      const afterOutput = {
        title: "",
        output: '[{"uri": "file:///project/test.cpp", "range": {"start": {"line": 3, "character": 4}}}]',
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-1", args: beforeOutput.args },
        afterOutput,
      );

      expect(afterOutput.output).toContain("test.cpp");
      expect(afterOutput.output).not.toContain("incorrectly");
      expect(afterOutput.output).not.toContain("Warning");
    });

    it("should handle file not found through full pipeline", async () => {
      const plugin = createPlugin({
        fileExists: () => false,
        readFile: () => "",
        getDirectory: () => "/project",
      });

      const beforeOutput = {
        args: {
          operation: "goToDefinition",
          filePath: "missing.cpp",
          symbol: "foo",
          fragment: "foo()",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-2" },
        beforeOutput,
      );

      const beforeArgs = beforeOutput.args as any;
      expect(beforeArgs.line).toBe(1);
      expect(beforeArgs.character).toBe(1);

      const afterOutput = {
        title: "",
        output: "No results found for goToDefinition",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-2", args: beforeOutput.args },
        afterOutput,
      );

      expect(afterOutput.output).toContain("search parameters were specified incorrectly");
      expect(afterOutput.output).toContain("EMPTY_CODE");
    });

    it("should handle symbol not found through full pipeline", async () => {
      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => CPP_CODE,
        getDirectory: () => "/project",
      });

      const beforeOutput = {
        args: {
          operation: "goToDefinition",
          filePath: "test.cpp",
          symbol: "nonExistent",
          fragment: "nonExistent()",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-3" },
        beforeOutput,
      );

      const beforeArgs = beforeOutput.args as any;
      expect(beforeArgs.line).toBe(1);
      expect(beforeArgs.character).toBe(1);

      const afterOutput = {
        title: "",
        output: "No results found for goToDefinition",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-3", args: beforeOutput.args },
        afterOutput,
      );

      expect(afterOutput.output).toContain("search parameters were specified incorrectly");
      expect(afterOutput.output).toContain("NO_MATCHES");
    });

    it("should handle multiple matches with warning through full pipeline", async () => {
      const code = `int foo() { return 1; }
int bar() { return foo(); }
int baz() { int foo = 0; return foo; }
`;

      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => code,
        getDirectory: () => "/project",
      });

      const beforeOutput = {
        args: {
          operation: "goToDefinition",
          filePath: "test.cpp",
          symbol: "foo",
          fragment: "foo",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-4" },
        beforeOutput,
      );

      const beforeArgs = beforeOutput.args as any;
      expect(beforeArgs.line).toBe(1);
      expect(beforeArgs.character).toBe(5);

      const afterOutput = {
        title: "",
        output: '[{"uri": "file:///project/test.cpp", "range": {"start": {"line": 0, "character": 3}}}]',
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-4", args: beforeOutput.args },
        afterOutput,
      );

      expect(afterOutput.output).toContain("file:///project/test.cpp");
      expect(afterOutput.output).toContain("query was constructed incorrectly");
      expect(afterOutput.output).toContain("MULTIPLE_MATCHES");
    });

    it("should work with real C++ fixture file", async () => {
      const fixturePath = path.join(FIXTURES_DIR, "calculator.cpp");
      const code = fs.readFileSync(fixturePath, "utf-8");

      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => code,
        getDirectory: () => path.dirname(fixturePath),
      });

      const beforeOutput = {
        args: {
          operation: "goToDefinition",
          filePath: "calculator.cpp",
          symbol: "add",
          fragment: "add(double a, double b)",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-5" },
        beforeOutput,
      );

      const beforeArgs = beforeOutput.args as any;
      expect(beforeArgs.line).toBe(11);
      expect(beforeArgs.character).toBe(12);

      const afterOutput = {
        title: "",
        output: '[{"uri": "file:///calculator.cpp", "range": {}}]',
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "int-call-5", args: beforeOutput.args },
        afterOutput,
      );

      expect(afterOutput.output).not.toContain("incorrectly");
      expect(afterOutput.output).not.toContain("Warning");
    });

    it("should handle multiple independent calls with different callIDs", async () => {
      const plugin = createPlugin({
        fileExists: () => true,
        readFile: () => CPP_CODE,
        getDirectory: () => "/project",
      });

      const output1 = {
        args: {
          operation: "goToDefinition",
          filePath: "test.cpp",
          symbol: "add",
          fragment: "add(1, 2)",
        },
      };

      const output2 = {
        args: {
          operation: "hover",
          filePath: "test.cpp",
          symbol: "result",
          fragment: "int result = add(1, 2)",
        },
      };

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "multi-1" },
        output1,
      );

      await plugin["tool.execute.before"](
        { tool: "lsp", sessionID: "s1", callID: "multi-2" },
        output2,
      );

      const args1 = output1.args as any;
      const args2 = output2.args as any;
      expect(args1.callID).toBeUndefined();
      expect(args2.callID).toBeUndefined();
      expect(args1.character).not.toBe(args2.character);

      const afterOutput1 = {
        title: "",
        output: "result from call 1",
        metadata: {},
      };

      const afterOutput2 = {
        title: "",
        output: "result from call 2",
        metadata: {},
      };

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "multi-1", args: {} },
        afterOutput1,
      );

      await plugin["tool.execute.after"](
        { tool: "lsp", sessionID: "s1", callID: "multi-2", args: {} },
        afterOutput2,
      );

      expect(afterOutput1.output).toBe("result from call 1");
      expect(afterOutput2.output).toBe("result from call 2");
    });
  });
});
