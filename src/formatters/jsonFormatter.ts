import { Formatter, FinderResult } from '../types';

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
        message: result.error.message,
      },
    }, null, 2);
  }
}
