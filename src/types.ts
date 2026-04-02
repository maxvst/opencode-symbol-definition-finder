export interface Position {
  line: number;
  column: number;
}

export interface SymbolMatch {
  symbol: string;
  position: Position;
  context: string;
}

export interface FinderResult {
  success: boolean;
  matches: SymbolMatch[];
  error?: string;
}

export interface FinderOptions {
  code: string;
  symbol: string;
  fragment: string;
}

export type OutputFormat = 'json' | 'llm' | string;

export interface Formatter {
  format(result: FinderResult): string;
}
