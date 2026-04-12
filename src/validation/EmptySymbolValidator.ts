import { FinderOptions, FinderError, FinderErrorCode } from '../types';
import { InputValidator } from './InputValidator';

export class EmptySymbolValidator implements InputValidator {
  validate(options: FinderOptions): FinderError | null {
    if (!options.symbol || options.symbol.trim().length === 0) {
      return { code: FinderErrorCode.EMPTY_SYMBOL };
    }
    return null;
  }
}
