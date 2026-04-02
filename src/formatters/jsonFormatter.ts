import { Formatter, FinderResult } from '../types';

export class JsonFormatter implements Formatter {
  format(result: FinderResult): string {
    return JSON.stringify(result, null, 2);
  }
}
