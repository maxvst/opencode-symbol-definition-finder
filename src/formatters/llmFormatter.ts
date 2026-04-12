import { Formatter, FinderResult, FinderError, FinderErrorCode } from '../types';

export class LLMFormatter implements Formatter {
  format(result: FinderResult): string {
    const lines: string[] = [];

    if (!result.success) {
      lines.push('STATUS: ERROR');
      lines.push(`ERROR_CODE: ${result.error.code}`);
      lines.push(`ERROR: ${this.formatErrorMessage(result.error)}`);
      return lines.join('\n');
    }

    if (result.matches.length === 0) {
      lines.push('STATUS: NOT_FOUND');
      lines.push('HINT: The symbol was not found at any location matching the fragment in the file. Verify the symbol name and fragment are correct and that the file contains the expected code. If the file does not contain the expected code, use other tools such as "read file" or "search in files" to locate the symbol.');
      return lines.join('\n');
    }

    lines.push('STATUS: FOUND');
    lines.push(`MATCH_COUNT: ${result.matches.length}`);
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
        return 'No matches found.';
    }
  }
}
