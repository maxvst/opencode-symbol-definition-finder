import { FinderOptions, FinderError } from '../types';
import { InputValidator } from './InputValidator';

export class ValidationChain implements InputValidator {
  constructor(private readonly validators: readonly InputValidator[]) {}

  validate(options: FinderOptions): FinderError | null {
    for (const validator of this.validators) {
      const error = validator.validate(options);
      if (error !== null) {
        return error;
      }
    }
    return null;
  }
}
