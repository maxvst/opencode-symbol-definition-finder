import { FinderOptions, FinderError, FinderErrorCode } from '../types';
import { InputValidator } from './InputValidator';
import { escapeRegExp } from '../utils/textNormalizer';

export class SymbolInFragmentValidator implements InputValidator {
  validate(options: FinderOptions): FinderError | null {
    const symbolPattern = `\\b${escapeRegExp(options.symbol)}\\b`;
    const symbolRegex = new RegExp(symbolPattern);

    if (!symbolRegex.test(options.fragment)) {
      return { code: FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT };
    }

    const globalRegex = new RegExp(symbolPattern, 'g');
    const fragmentMatches = options.fragment.match(globalRegex);
    if (!fragmentMatches || fragmentMatches.length !== 1) {
      return { code: FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT };
    }

    return null;
  }
}
