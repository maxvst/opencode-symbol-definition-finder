import {
  FinderOptions,
  FinderResult,
  SymbolFinderOptions,
} from './types';
import { InputValidator } from './validation/InputValidator';
import { ValidationChain } from './validation/ValidationChain';
import { EmptyCodeValidator } from './validation/EmptyCodeValidator';
import { EmptySymbolValidator } from './validation/EmptySymbolValidator';
import { EmptyFragmentValidator } from './validation/EmptyFragmentValidator';
import { InvalidSymbolValidator } from './validation/InvalidSymbolValidator';
import { SymbolInFragmentValidator } from './validation/SymbolInFragmentValidator';
import { SearchStrategy } from './search/SearchStrategy';
import { RegexSearchStrategy } from './search/RegexSearchStrategy';

const DEFAULT_CONTEXT_LINES = 3;

function createDefaultValidators(): InputValidator {
  return new ValidationChain([
    new EmptyCodeValidator(),
    new EmptySymbolValidator(),
    new EmptyFragmentValidator(),
    new InvalidSymbolValidator(),
    new SymbolInFragmentValidator(),
  ]);
}

export interface SymbolFinderDeps {
  readonly validator?: InputValidator;
  readonly searchStrategy?: SearchStrategy;
}

export class SymbolFinder {
  private readonly contextLines: number;
  private readonly validator: InputValidator;
  private readonly searchStrategy: SearchStrategy;

  constructor(options: SymbolFinderOptions & SymbolFinderDeps = {}) {
    const { contextLines, validator, searchStrategy } = options;
    this.contextLines = contextLines ?? DEFAULT_CONTEXT_LINES;
    this.validator = validator ?? createDefaultValidators();
    this.searchStrategy = searchStrategy ?? new RegexSearchStrategy();
  }

  find(options: FinderOptions): FinderResult {
    const error = this.validator.validate(options);
    if (error !== null) {
      return { success: false, matches: [], error };
    }

    const matches = this.searchStrategy.search(
      options.code,
      options.symbol,
      options.fragment,
      this.contextLines,
    );

    return { success: true, matches };
  }
}

export function find(options: FinderOptions): FinderResult {
  const finder = new SymbolFinder();
  return finder.find(options);
}
