import { FinderOptions, FinderResult, SymbolMatch, Position } from './types';
import { normalizeForComparison } from './utils/textNormalizer';

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

    const lines = code.split('\n');
    const matches: SymbolMatch[] = [];
    const normalizedFragment = normalizeForComparison(fragment);
    
    const symbolPattern = this.createSymbolPattern(symbol);
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line) continue;
      
      let match: RegExpExecArray | null;
      const regex = new RegExp(symbolPattern.source, symbolPattern.flags);
      
      while ((match = regex.exec(line)) !== null) {
        const column = match.index + 1;
        const position: Position = {
          line: lineIndex + 1,
          column: column
        };
        
        const context = this.extractContext(lines, lineIndex, match.index);
        const normalizedContext = normalizeForComparison(context);
        
        if (this.fragmentMatches(normalizedFragment, normalizedContext, symbol)) {
          matches.push({
            symbol: symbol,
            position: position,
            context: context
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

  private createSymbolPattern(symbol: string): RegExp {
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const wordBoundaryChars = [
      '\\s', '\\t', '\\n', '\\r',
      '\\(', '\\)', '\\[', '\\]', '\\{', '\\}',
      ',', ';', ':', '\\.', '=', '<', '>', '!', '&', '\\|', '\\+', '-', '\\*', '/',
      '"', "'", '`'
    ].join('');
    
    const pattern = `(?<![${wordBoundaryChars}])${escapedSymbol}(?![${wordBoundaryChars}])`;
    
    try {
      return new RegExp(pattern, 'g');
    } catch {
      return new RegExp(`\\b${escapedSymbol}\\b`, 'g');
    }
  }

  private extractContext(lines: string[], lineIndex: number, _charIndex: number): string {
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

  private fragmentMatches(normalizedFragment: string, normalizedContext: string, symbol: string): boolean {
    const fragmentWords = this.extractSignificantTokens(normalizedFragment);
    const contextWords = this.extractSignificantTokens(normalizedContext);
    
    if (fragmentWords.length === 0 || contextWords.length === 0) {
      return false;
    }
    
    let matchCount = 0;
    const threshold = Math.max(1, Math.floor(fragmentWords.length * 0.5));
    
    for (const word of fragmentWords) {
      if (contextWords.includes(word)) {
        matchCount++;
      }
    }
    
    if (matchCount >= threshold) {
      return true;
    }
    
    const fragmentHasSymbol = normalizedFragment.includes(symbol);
    const contextHasSymbol = normalizedContext.includes(symbol);
    
    if (fragmentHasSymbol && contextHasSymbol) {
      const fragmentSubsequences = this.extractSubsequences(normalizedFragment, 3);
      const contextSubsequences = this.extractSubsequences(normalizedContext, 3);
      
      for (const subseq of fragmentSubsequences) {
        if (contextSubsequences.includes(subseq)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private extractSignificantTokens(text: string): string[] {
    return text
      .split(/[\s\(\)\{\}\[\],;:.\-+=<>!&|*/\\]+/)
      .filter(token => token.length > 0 && !/^\d+$/.test(token));
  }

  private extractSubsequences(text: string, minLength: number): string[] {
    const subsequences: string[] = [];
    const tokens = this.extractSignificantTokens(text);
    
    for (let i = 0; i < tokens.length; i++) {
      for (let len = minLength; len <= tokens.length - i; len++) {
        const subseq = tokens.slice(i, i + len).join(' ');
        subsequences.push(subseq);
      }
    }
    
    return subsequences;
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
