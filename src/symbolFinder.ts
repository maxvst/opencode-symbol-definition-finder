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

    if (this.countSymbolInFragment(symbol, fragment) !== 1) {
      return {
        success: false,
        matches: [],
        error: 'Symbol must appear exactly once in fragment'
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

    const symbolOffsetInFragment = this.findSymbolOffset(normalizedFragment, symbolPatternStr);

    const normalizedSymbolPositions = this.findAllPositions(normalizedCode, symbolPatternStr);

    const matches: SymbolMatch[] = [];

    for (let i = 0; i < normalizedSymbolPositions.length; i++) {
      const symbolPos = normalizedSymbolPositions[i]!;
      const candidateStart = symbolPos - symbolOffsetInFragment;

      if (candidateStart < 0) continue;

      if (normalizedCode.startsWith(normalizedFragment, candidateStart)
          && i < originalOccurrences.length) {
        const orig = originalOccurrences[i]!;
        matches.push({
          symbol: symbol,
          position: { line: orig.line, column: orig.column },
          context: this.extractContext(lines, orig.line - 1)
        });
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

  private findSymbolOffset(text: string, symbolPatternStr: string): number {
    const regex = new RegExp(symbolPatternStr, 'g');
    const match = regex.exec(text);
    return match !== null ? match.index : -1;
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

  private countSymbolInFragment(symbol: string, fragment: string): number {
    const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'g');
    const matches = fragment.match(pattern);
    return matches ? matches.length : 0;
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
