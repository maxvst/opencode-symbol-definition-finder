import { SymbolMatch } from '../types';
import { SearchStrategy } from './SearchStrategy';
import { normalizeForComparison, escapeRegExp } from '../utils/textNormalizer';

export class RegexSearchStrategy implements SearchStrategy {
  search(code: string, symbol: string, fragment: string | undefined, contextLines: number): SymbolMatch[] {
    const symbolPattern = `\\b${escapeRegExp(symbol)}\\b`;
    const symbolRegex = new RegExp(symbolPattern, 'g');

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

    if (!fragment || fragment.trim().length === 0) {
      return this.buildMatchesFromOccurrences(originalOccurrences, symbol, lines, contextLines);
    }

    const normalizedCode = normalizeForComparison(code);
    const normalizedFragment = normalizeForComparison(fragment);

    const symbolOffsetInFragment = this.findSymbolOffset(normalizedFragment, symbolRegex);
    if (symbolOffsetInFragment < 0) {
      return this.buildMatchesFromOccurrences(originalOccurrences, symbol, lines, contextLines);
    }

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
          context: this.extractContext(lines, orig.line - 1, contextLines),
        });
      }
    }

    return this.deduplicateMatches(matches);
  }

  private buildMatchesFromOccurrences(
    occurrences: readonly { readonly line: number; readonly column: number }[],
    symbol: string,
    lines: string[],
    contextLines: number,
  ): SymbolMatch[] {
    return this.deduplicateMatches(
      occurrences.map((occ) => ({
        symbol,
        position: { line: occ.line, column: occ.column },
        context: this.extractContext(lines, occ.line - 1, contextLines),
      })),
    );
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

  private extractContext(lines: string[], lineIndex: number, contextLines: number): string {
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
