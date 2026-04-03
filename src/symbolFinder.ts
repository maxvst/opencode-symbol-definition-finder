import {
  FinderOptions,
  FinderResult,
  SymbolMatch,
  FinderErrorCode,
  SymbolFinderOptions,
} from './types';
import { normalizeForComparison, escapeRegExp } from './utils/textNormalizer';

const DEFAULT_CONTEXT_LINES = 3;

export class SymbolFinder {
  private readonly contextLines: number;

  constructor(options: SymbolFinderOptions = {}) {
    this.contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
  }

  find(options: FinderOptions): FinderResult {
    const { code, symbol, fragment } = options;

    if (!code || code.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.EMPTY_CODE, message: 'Code is empty' },
      };
    }

    if (!symbol || symbol.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.EMPTY_SYMBOL, message: 'Symbol is empty' },
      };
    }

    if (!fragment || fragment.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.EMPTY_FRAGMENT, message: 'Fragment is empty' },
      };
    }

    if (!this.isValidSymbol(symbol)) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.INVALID_SYMBOL, message: 'Symbol contains invalid characters' },
      };
    }

    const symbolPattern = `\\b${escapeRegExp(symbol)}\\b`;
    const symbolRegex = new RegExp(symbolPattern, 'g');
    const symbolRegexNoGlobal = new RegExp(symbolPattern);

    if (!symbolRegexNoGlobal.test(fragment)) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT, message: 'Symbol not found in fragment' },
      };
    }

    const fragmentMatches = fragment.match(symbolRegex);
    if (!fragmentMatches || fragmentMatches.length !== 1) {
      return {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT, message: 'Symbol must appear exactly once in fragment' },
      };
    }

    const lines = code.split(/\r?\n/);
    const originalOccurrences: { readonly line: number; readonly column: number }[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      symbolRegex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = symbolRegex.exec(line)) !== null) {
        originalOccurrences.push({
          line: lineIndex + 1,
          column: match.index + 1,
        });
      }
    }

    const normalizedCode = normalizeForComparison(code);
    const normalizedFragment = normalizeForComparison(fragment);

    const symbolOffsetInFragment = this.findSymbolOffset(normalizedFragment, symbolRegex);

    const normalizedSymbolPositions = this.findAllPositions(normalizedCode, symbolRegex);

    const matches: SymbolMatch[] = [];

    for (let i = 0; i < normalizedSymbolPositions.length; i++) {
      const symbolPos = normalizedSymbolPositions[i]!;
      const candidateStart = symbolPos - symbolOffsetInFragment;

      if (candidateStart < 0) continue;

      if (
        normalizedCode.startsWith(normalizedFragment, candidateStart) &&
        i < originalOccurrences.length
      ) {
        const orig = originalOccurrences[i]!;
        matches.push({
          symbol: symbol,
          position: { line: orig.line, column: orig.column },
          context: this.extractContext(lines, orig.line - 1),
        });
      }
    }

    if (matches.length === 0) {
      return {
        success: true,
        matches: [],
      };
    }

    return {
      success: true,
      matches: this.deduplicateMatches(matches),
    };
  }

  private findSymbolOffset(text: string, regex: RegExp): number {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    return match !== null ? match.index : -1;
  }

  private findAllPositions(text: string, regex: RegExp): number[] {
    const positions: number[] = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index);
    }

    return positions;
  }

  private isValidSymbol(symbol: string): boolean {
    const trimmed = symbol.trim();
    if (trimmed !== symbol) return false;
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed);
  }

  private extractContext(lines: string[], lineIndex: number): string {
    const startLine = Math.max(0, lineIndex - this.contextLines);
    const endLine = Math.min(lines.length - 1, lineIndex + this.contextLines);

    const contextParts: string[] = [];

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      if (line !== undefined) {
        contextParts.push(line);
      }
    }

    return contextParts.join('\n');
  }

  private deduplicateMatches(matches: SymbolMatch[]): SymbolMatch[] {
    const seen = new Set<string>();
    const unique: SymbolMatch[] = [];

    for (const match of matches) {
      const key = `${match.position.line}:${match.position.column}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }

    return unique;
  }
}

export function find(options: FinderOptions): FinderResult {
  const finder = new SymbolFinder();
  return finder.find(options);
}
