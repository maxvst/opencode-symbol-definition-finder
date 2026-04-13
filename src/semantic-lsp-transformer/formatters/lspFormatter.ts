import {
  Formatter,
  FinderResult,
  FinderError,
  FinderErrorCode,
  FinderWarning,
  FinderWarningCode,
  LspFormattedResult,
  LspFormattedIssue,
} from '../types';

export class LspFormatter implements Formatter<LspFormattedResult> {
  format(result: FinderResult): LspFormattedResult {
    return {
      matches: result.matches.map((m) => ({
        symbol: m.symbol,
        position: { line: m.position.line, column: m.position.column },
        context: m.context,
      })),
      errors: result.errors.map((e) => this.formatError(e)),
      warnings: result.warnings.map((w) => this.formatWarning(w)),
    };
  }

  private formatError(error: FinderError): LspFormattedIssue {
    switch (error.code) {
      case FinderErrorCode.FILE_NOT_FOUND:
        return {
          code: error.code,
          message: 'File not found',
          cause: `The file "${error.details?.['file'] ?? 'unknown'}" does not exist or is not accessible from the project directory.`,
          suggestion: 'Verify the file path is correct relative to the project directory. Use tools such as "list directory" or "search files" to locate the file, then retry with the correct path.',
        };
      case FinderErrorCode.EMPTY_CODE:
        return {
          code: error.code,
          message: 'Code is empty',
          cause: 'The resolved file is empty or does not contain any source code.',
          suggestion: 'Provide a valid file path in the "file" parameter that points to a file containing source code.',
        };
      case FinderErrorCode.EMPTY_SYMBOL:
        return {
          code: error.code,
          message: 'Symbol is empty',
          cause: 'The "symbol" parameter was provided as an empty string.',
          suggestion: 'Provide a valid symbol name (function, variable, or class name) in the "symbol" parameter. Example: "myFunction".',
        };
      case FinderErrorCode.EMPTY_FRAGMENT:
        return {
          code: error.code,
          message: 'Fragment is empty',
          cause: 'The "fragment" parameter was provided as an empty string.',
          suggestion: 'Provide a code snippet containing the symbol in the "fragment" parameter to disambiguate between multiple occurrences. Example: "myFunction(arg1, arg2)".',
        };
      case FinderErrorCode.INVALID_SYMBOL:
        return {
          code: error.code,
          message: 'Symbol contains invalid characters',
          cause: 'The "symbol" parameter contains spaces, parentheses, brackets, or other characters that are not valid in an identifier.',
          suggestion: 'Pass only the symbol name using valid identifier characters (letters, digits, underscore, dollar sign). For example, use "myFunction" instead of "myFunction()" or " obj.method" .',
        };
      case FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT:
        return {
          code: error.code,
          message: 'Symbol not found in fragment',
          cause: 'The symbol name does not appear in the provided fragment text.',
          suggestion: 'Ensure the "fragment" parameter contains the exact symbol name specified in the "symbol" parameter. For example, if symbol is "foo", the fragment must include "foo" as a substring.',
        };
      case FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT:
        return {
          code: error.code,
          message: 'Symbol appears multiple times in fragment',
          cause: 'The symbol occurs more than once within the fragment, making it impossible to uniquely identify the target occurrence.',
          suggestion: 'Provide a larger or more specific fragment where the symbol appears exactly once. Include surrounding context lines so the correct occurrence can be uniquely identified.',
        };
      case FinderErrorCode.NO_MATCHES:
        return {
          code: error.code,
          message: 'No matches found',
          cause: 'The symbol was not found at any position in the file that matches the given fragment.',
          suggestion: 'Verify the symbol name and fragment are correct and that the file contains the expected code. If the file does not contain the expected code, use other tools such as "read file" or "search in files" to locate the symbol.',
        };
    }
  }

  private formatWarning(warning: FinderWarning): LspFormattedIssue {
    switch (warning.code) {
      case FinderWarningCode.MULTIPLE_MATCHES:
        return {
          code: warning.code,
          message: 'Multiple matches found',
          cause: `The symbol was found at ${warning.details?.['totalMatches'] ?? 'multiple'} locations (lines: ${warning.details?.['lines'] ?? 'unknown'}). Only the first match is returned.`,
          suggestion: 'Provide a more specific "fragment" parameter that uniquely identifies the desired occurrence. Include additional surrounding code so that only one location matches.',
        };
      case FinderWarningCode.FRAGMENT_FALLBACK:
        return {
          code: warning.code,
          message: 'Fragment fallback',
          cause: `The fragment was unusable (reason: ${warning.details?.['reason'] ?? 'unknown'}). The search was performed by symbol name only, which may return an imprecise result.`,
          suggestion: 'Provide a valid "fragment" parameter containing the symbol to improve match accuracy. If the fragment was empty, include the code snippet. If the symbol was absent from the fragment, ensure it contains the exact symbol name.',
        };
    }
  }
}
