import { Formatter, FinderResult, FinderError, FinderErrorCode, FinderWarning, FinderWarningCode } from '../types';

export class LLMFormatter implements Formatter<string> {
  format(result: FinderResult): string {
    const lines: string[] = [];

    const hasErrors = result.errors.length > 0;
    const hasWarnings = result.warnings.length > 0;
    const hasMatches = result.matches.length > 0;

    if (hasErrors && !hasMatches) {
      lines.push('STATUS: ERROR');
      result.errors.forEach((error, index) => {
        lines.push(`ERROR_${index + 1}_CODE: ${error.code}`);
        lines.push(`ERROR_${index + 1}: ${this.formatErrorMessage(error)}`);
      });
      return lines.join('\n');
    }

    if (!hasMatches) {
      lines.push('STATUS: NOT_FOUND');
      lines.push('HINT: The symbol was not found at any location matching the fragment in the file. Verify the symbol name and fragment are correct and that the file contains the expected code. If the file does not contain the expected code, use other tools such as "read file" or "search in files" to locate the symbol.');
      return lines.join('\n');
    }

    lines.push('STATUS: FOUND');
    lines.push(`MATCH_COUNT: ${result.matches.length}`);

    if (hasErrors) {
      lines.push('');
      lines.push('ERRORS:');
      result.errors.forEach((error, index) => {
        lines.push(`  - ERROR_${index + 1}:`);
        lines.push(`      CODE: ${error.code}`);
        lines.push(`      MESSAGE: ${this.formatErrorMessage(error)}`);
      });
    }

    if (hasWarnings) {
      lines.push('');
      lines.push('WARNINGS:');
      result.warnings.forEach((warning, index) => {
        lines.push(`  - WARNING_${index + 1}:`);
        lines.push(`      CODE: ${warning.code}`);
        lines.push(`      MESSAGE: ${this.formatWarningMessage(warning)}`);
      });
    }

    lines.push('');
    lines.push('MATCHES:');

    result.matches.forEach((match, index) => {
      lines.push(`  - MATCH_${index + 1}:`);
      lines.push(`      SYMBOL: ${match.symbol}`);
      lines.push(`      LINE: ${match.position.line}`);
      lines.push(`      COLUMN: ${match.position.column}`);
      lines.push(`      CONTEXT: |`);
      match.context.split('\n').forEach(contextLine => {
        lines.push(`        ${contextLine}`);
      });
      lines.push('');
    });

    return lines.join('\n');
  }

  private formatWarningMessage(warning: FinderWarning): string {
    switch (warning.code) {
      case FinderWarningCode.MULTIPLE_MATCHES: {
        const total = warning.details?.['totalMatches'] ?? 'unknown';
        const linesStr = warning.details?.['lines'] ?? 'unknown';
        return `Multiple matches found (${total}). Returning first match at line(s): ${linesStr}. Use a more specific fragment to disambiguate.`;
      }
      case FinderWarningCode.FRAGMENT_FALLBACK: {
        const reason = warning.details?.['reason'] ?? 'unknown';
        return `Fragment was not usable (reason: ${reason}). Searched by symbol name only. The result may not be precise.`;
      }
    }
  }

  private formatErrorMessage(error: FinderError): string {
    switch (error.code) {
      case FinderErrorCode.FILE_NOT_FOUND:
        return `File not found: ${error.details?.['file'] ?? 'unknown'}. Verify the file path is correct relative to the project directory. Use tools like "list directory" or "search files" to locate the file.`;
      case FinderErrorCode.EMPTY_CODE:
        return 'Code is empty. Provide the correct file path in the "file" parameter that points to a file containing source code.';
      case FinderErrorCode.EMPTY_SYMBOL:
        return 'Symbol is empty. Provide a valid symbol name (function, variable, or class name) in the "symbol" parameter.';
      case FinderErrorCode.EMPTY_FRAGMENT:
        return 'Fragment is empty. Provide a code snippet containing the symbol in the "fragment" parameter to disambiguate between multiple occurrences.';
      case FinderErrorCode.INVALID_SYMBOL:
        return 'Symbol contains invalid characters. Use only a valid identifier (letters, digits, _, $) without spaces or special characters. Pass only the symbol name, e.g. "myFunction", not a call expression like "myFunction()".';
      case FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT:
        return 'Symbol not found in fragment. Ensure the "fragment" parameter contains the exact symbol name specified in the "symbol" parameter.';
      case FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT:
        return 'Symbol appears multiple times in the fragment. Provide a larger fragment where the symbol occurs exactly once so the correct occurrence can be uniquely identified.';
      case FinderErrorCode.NO_MATCHES:
        return 'No matches found. Returning fallback position (1:1). Use other tools to locate the symbol manually.';
    }
  }
}
