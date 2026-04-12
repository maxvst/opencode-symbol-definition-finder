import { FinderOptions, FinderError, FinderErrorCode } from '../types';
import { InputValidator } from './InputValidator';

export class EmptyFragmentValidator implements InputValidator {
  validate(options: FinderOptions): FinderError | null {
    if (!options.fragment || options.fragment.trim().length === 0) {
      return { code: FinderErrorCode.EMPTY_FRAGMENT };
    }
    return null;
  }
}
