---
name: go-to-definition
description: Find the definition of a symbol (function, class, variable, type and other) using the symbol-finder tool to locate its exact position and then the lsp tool with goToDefinition operation to resolve the definition. Do NOT use grep, glob, read, or bash to search for definitions — use only symbol-finder and lsp tools.
---

# Go To Definition

Use this workflow to resolve where a symbol is defined.

## Step 1: Locate the symbol position with symbol-finder

Call the `symbol-finder` tool:

- `file`: path to the file where the symbol is used (relative to project root)
- `symbol`: the exact symbol name
- `fragment`: a short code snippet containing the symbol. If you do not have a specific code line, use the **symbol name itself** as the fragment.

Example:
```
symbol-finder(file="src/main.ts", symbol="calculateSum", fragment="calculateSum")
```

## Step 2: Parse the symbol-finder result

The output format:

```
STATUS: FOUND
MATCH_COUNT: 1

MATCHES:
  - MATCH_1:
      SYMBOL: calculateSum
      LINE: 5
      COLUMN: 17
      CONTEXT: |
        ...
```

Extract the **LINE** and **COLUMN** from **MATCH_1** (the first match). These are 1-based values passed directly to the LSP tool.

If `STATUS` is `NOT_FOUND` or `ERROR`, the symbol-finder could not locate the symbol. In this case, fall back to using `grep` or `read` to search for the definition manually.

## Step 3: Call LSP goToDefinition

Call the `lsp` tool:

- `operation`: `"goToDefinition"`
- `filePath`: the same file path used in Step 1
- `line`: the LINE value from Step 2
- `character`: the COLUMN value from Step 2

Example:
```
lsp(operation="goToDefinition", filePath="src/main.ts", line=5, character=17)
```

The LSP tool returns a JSON array of locations. Each location contains:
- `uri`: file URI where the symbol is defined
- `range`: start/end position of the definition

Use this information to continue the current task — for example, read the definition file, analyze the implementation, or apply edits. Do not simply report the location; act on it as needed by the task at hand.

If goToDefinition returns no results, fall back to using `grep` or `read` to locate the definition.
