import { FinderOptions, FinderError } from '../types';

export interface InputValidator {
  validate(options: FinderOptions): FinderError | null;
}
