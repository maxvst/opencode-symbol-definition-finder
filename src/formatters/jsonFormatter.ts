import { Formatter, FinderResult, FinderError, FinderErrorCode } from '../types';

export class JsonFormatter implements Formatter {
  format(result: FinderResult): string {
    if (result.success) {
      return JSON.stringify({
        success: true,
        matches: result.matches,
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      matches: [],
      error: {
        code: result.error.code,
        message: this.formatErrorMessage(result.error),
      },
    }, null, 2);
  }

  private formatErrorMessage(error: FinderError): string {
    switch (error.code) {
      case FinderErrorCode.FILE_NOT_FOUND:
        return `File not found: ${error.details?.['file'] ?? 'unknown'}`;
      case FinderErrorCode.EMPTY_CODE:
        return 'Code is empty';
      case FinderErrorCode.EMPTY_SYMBOL:
        return 'Symbol is empty';
      case FinderErrorCode.EMPTY_FRAGMENT:
        return 'Fragment is empty';
      case FinderErrorCode.INVALID_SYMBOL:
        return 'Symbol contains invalid characters';
      case FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT:
        return 'Symbol not found in fragment';
      case FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT:
        return 'Symbol appears multiple times in fragment';
      case FinderErrorCode.NO_MATCHES:
        return 'No matches found';
    }
  }
}
