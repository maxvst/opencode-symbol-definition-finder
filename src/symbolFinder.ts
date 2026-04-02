import { FinderOptions, FinderResult, SymbolMatch, Position } from './types';
import { normalizeForComparison, escapeRegExp } from './utils/textNormalizer';

export class SymbolFinder {
  find(options: FinderOptions): FinderResult {
    const { code, symbol, fragment } = options;

    if (!code || code.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: 'Code is empty'
      };
    }

    if (!symbol || symbol.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: 'Symbol is empty'
      };
    }

    if (!fragment || fragment.trim().length === 0) {
      return {
        success: false,
        matches: [],
        error: 'Fragment is empty'
      };
    }

    if (!this.isValidSymbol(symbol)) {
      return {
        success: false,
        matches: [],
        error: 'Symbol contains invalid characters'
      };
    }

    if (!this.symbolInFragment(symbol, fragment)) {
      return {
        success: false,
        matches: [],
        error: 'Symbol not found in fragment'
      };
    }

    const lines = code.split(/\r?\n/);
    const symbolPatternStr = `\\b${escapeRegExp(symbol)}\\b`;

    const originalOccurrences: Position[] = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      const regex = new RegExp(symbolPatternStr, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        originalOccurrences.push({
          line: lineIndex + 1,
          column: match.index + 1
        });
      }
    }

    const normalizedCode = normalizeForComparison(code);
    const normalizedFragment = normalizeForComparison(fragment);

    const symbolOffsetsInFragment = this.findSymbolOffsets(normalizedFragment, symbolPatternStr);
    if (symbolOffsetsInFragment.length === 0) {
      return {
        success: false,
        matches: [],
        error: 'Symbol not found in fragment'
      };
    }

    const normalizedSymbolPositions = this.findAllPositions(normalizedCode, symbolPatternStr);

    const fragmentPositions: number[] = [];
    let searchFrom = 0;
    while (searchFrom < normalizedCode.length) {
      const idx = normalizedCode.indexOf(normalizedFragment, searchFrom);
      if (idx === -1) break;
      fragmentPositions.push(idx);
      searchFrom = idx + 1;
    }

    const matches: SymbolMatch[] = [];

    for (const fragPos of fragmentPositions) {
      for (const offset of symbolOffsetsInFragment) {
        const expectedSymbolPos = fragPos + offset;
        const symbolIdx = normalizedSymbolPositions.indexOf(expectedSymbolPos);
        if (symbolIdx !== -1 && symbolIdx < originalOccurrences.length) {
          const orig = originalOccurrences[symbolIdx]!;
          matches.push({
            symbol: symbol,
            position: { line: orig.line, column: orig.column },
            context: this.extractContext(lines, orig.line - 1)
          });
        }
      }
    }

    if (matches.length === 0) {
      return {
        success: true,
        matches: [],
        error: 'No matches found for the given symbol and fragment'
      };
    }

    return {
      success: true,
      matches: this.deduplicateMatches(matches)
    };
  }

  private findSymbolOffsets(text: string, symbolPatternStr: string): number[] {
    const offsets: number[] = [];
    const regex = new RegExp(symbolPatternStr, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      offsets.push(match.index);
    }

    return offsets;
  }

  private findAllPositions(text: string, patternStr: string): number[] {
    const positions: number[] = [];
    const regex = new RegExp(patternStr, 'g');
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

  private symbolInFragment(symbol: string, fragment: string): boolean {
    const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
    return pattern.test(fragment);
  }

  private extractContext(lines: string[], lineIndex: number): string {
    const contextLines: number = 3;
    const startLine = Math.max(0, lineIndex - contextLines);
    const endLine = Math.min(lines.length - 1, lineIndex + contextLines);

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
