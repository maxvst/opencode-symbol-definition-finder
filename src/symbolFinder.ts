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

    const lines = code.split('\n');
    const matches: SymbolMatch[] = [];
    const normalizedFragment = normalizeForComparison(fragment);
    const fragmentLineCount = fragment.split('\n').length;
    const symbolPattern = this.createSymbolPattern(symbol);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line) continue;

      const regex = new RegExp(symbolPattern.source, symbolPattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        const column = match.index + 1;
        const position: Position = {
          line: lineIndex + 1,
          column: column
        };

        if (this.fragmentMatchesContext(normalizedFragment, lines, lineIndex, fragmentLineCount)) {
          matches.push({
            symbol: symbol,
            position: position,
            context: this.extractContext(lines, lineIndex)
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

  private isValidSymbol(symbol: string): boolean {
    const trimmed = symbol.trim();
    if (trimmed !== symbol) return false;
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed);
  }

  private symbolInFragment(symbol: string, fragment: string): boolean {
    const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
    return pattern.test(fragment);
  }

  private createSymbolPattern(symbol: string): RegExp {
    const escapedSymbol = escapeRegExp(symbol);
    return new RegExp(`\\b${escapedSymbol}\\b`, 'g');
  }

  private fragmentMatchesContext(
    normalizedFragment: string,
    lines: string[],
    lineIndex: number,
    fragmentLineCount: number
  ): boolean {
    const minStart = Math.max(0, lineIndex - fragmentLineCount + 1);
    const maxStart = Math.min(lines.length - fragmentLineCount, lineIndex);

    for (let start = minStart; start <= maxStart; start++) {
      if (start + fragmentLineCount > lines.length) continue;

      const contextLines: string[] = [];
      for (let i = 0; i < fragmentLineCount; i++) {
        contextLines.push(lines[start + i] || '');
      }
      const normalizedContext = normalizeForComparison(contextLines.join('\n'));

      if (normalizedContext.includes(normalizedFragment)) {
        return true;
      }
    }

    return false;
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
