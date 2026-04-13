import {
  FinderOptions,
  FinderResult,
  FinderError,
  FinderErrorCode,
  FinderWarning,
  FinderWarningCode,
  SemanticLspTransformerOptions,
  SymbolMatch,
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
import { escapeRegExp } from './utils/textNormalizer';

const DEFAULT_CONTEXT_LINES = 3;

const FALLBACK_POSITION = { line: 1, column: 1 };

function createDefaultValidators(): InputValidator {
  return new ValidationChain([
    new EmptyCodeValidator(),
    new EmptySymbolValidator(),
    new EmptyFragmentValidator(),
    new InvalidSymbolValidator(),
    new SymbolInFragmentValidator(),
  ]);
}

export interface SemanticLspTransformerDeps {
  readonly validator?: InputValidator;
  readonly searchStrategy?: SearchStrategy;
}

export class SemanticLspTransformer {
  private readonly contextLines: number;
  private readonly validator: InputValidator;
  private readonly searchStrategy: SearchStrategy;

  constructor(options: SemanticLspTransformerOptions & SemanticLspTransformerDeps = {}) {
    const { contextLines, validator, searchStrategy } = options;
    this.contextLines = contextLines ?? DEFAULT_CONTEXT_LINES;
    this.validator = validator ?? createDefaultValidators();
    this.searchStrategy = searchStrategy ?? new RegexSearchStrategy();
  }

  find(options: FinderOptions): FinderResult {
    if (options.bestEffort) {
      return this.findBestEffort(options);
    }

    const error = this.validator.validate(options);
    if (error !== null) {
      return { matches: [], errors: [error], warnings: [] };
    }

    const matches = this.searchStrategy.search(
      options.code,
      options.symbol,
      options.fragment,
      this.contextLines,
    );

    return { matches, errors: [], warnings: [] };
  }

  private findBestEffort(options: FinderOptions): FinderResult {
    const errors: FinderError[] = [];
    const warnings: FinderWarning[] = [];

    if (!options.code || options.code.trim().length === 0) {
      return {
        matches: [this.createFallbackMatch('')],
        errors: [{ code: FinderErrorCode.EMPTY_CODE }],
        warnings: [],
      };
    }

    if (!options.symbol || options.symbol.trim().length === 0) {
      return {
        matches: [this.createFallbackMatch(options.code)],
        errors: [{ code: FinderErrorCode.EMPTY_SYMBOL }],
        warnings: [],
      };
    }

    let effectiveFragment: string | undefined = options.fragment;
    const trimmedFragment = effectiveFragment?.trim() ?? '';

    if (trimmedFragment.length === 0) {
      warnings.push({
        code: FinderWarningCode.FRAGMENT_FALLBACK,
        details: { reason: 'EMPTY_FRAGMENT' },
      });
      effectiveFragment = undefined;
    } else {
      const symbolPattern = `\\b${escapeRegExp(options.symbol)}\\b`;
      const symbolRegex = new RegExp(symbolPattern);
      if (!symbolRegex.test(trimmedFragment)) {
        warnings.push({
          code: FinderWarningCode.FRAGMENT_FALLBACK,
          details: { reason: 'SYMBOL_NOT_IN_FRAGMENT' },
        });
        effectiveFragment = undefined;
      }
    }

    const matches = this.searchStrategy.search(
      options.code,
      options.symbol,
      effectiveFragment,
      this.contextLines,
    );

    if (matches.length === 0) {
      errors.push({ code: FinderErrorCode.NO_MATCHES });
      return {
        matches: [this.createFallbackMatch(options.code)],
        errors,
        warnings,
      };
    }

    if (matches.length > 1) {
      warnings.push({
        code: FinderWarningCode.MULTIPLE_MATCHES,
        details: {
          totalMatches: matches.length,
          lines: matches.map((m) => m.position.line).join(','),
        },
      });
    }

    return {
      matches: [matches[0]!],
      errors,
      warnings,
    };
  }

  private createFallbackMatch(code: string): SymbolMatch {
    const contextLines = code.split(/\r?\n/).slice(0, 7).join('\n');
    return {
      symbol: '',
      position: FALLBACK_POSITION,
      context: contextLines,
    };
  }
}

export function find(options: FinderOptions): FinderResult {
  const transformer = new SemanticLspTransformer();
  return transformer.find(options);
}
