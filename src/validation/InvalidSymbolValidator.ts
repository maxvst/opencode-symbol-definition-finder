import { FinderOptions, FinderError, FinderErrorCode } from '../types';
import { InputValidator } from './InputValidator';

export class InvalidSymbolValidator implements InputValidator {
  validate(options: FinderOptions): FinderError | null {
    const symbol = options.symbol;
    const trimmed = symbol.trim();
    if (trimmed !== symbol) {
      return { code: FinderErrorCode.INVALID_SYMBOL };
    }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
      return { code: FinderErrorCode.INVALID_SYMBOL };
    }
    return null;
  }
}
