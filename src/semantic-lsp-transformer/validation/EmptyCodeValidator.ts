import { FinderOptions, FinderError, FinderErrorCode } from '../types';
import { InputValidator } from './InputValidator';

export class EmptyCodeValidator implements InputValidator {
  validate(options: FinderOptions): FinderError | null {
    if (!options.code || options.code.trim().length === 0) {
      return { code: FinderErrorCode.EMPTY_CODE };
    }
    return null;
  }
}
