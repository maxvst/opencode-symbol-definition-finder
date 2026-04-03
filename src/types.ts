export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface SymbolMatch {
  readonly symbol: string;
  readonly position: Position;
  readonly context: string;
}

export enum FinderErrorCode {
  EMPTY_CODE = 'EMPTY_CODE',
  EMPTY_SYMBOL = 'EMPTY_SYMBOL',
  EMPTY_FRAGMENT = 'EMPTY_FRAGMENT',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  SYMBOL_NOT_IN_FRAGMENT = 'SYMBOL_NOT_IN_FRAGMENT',
  SYMBOL_NOT_UNIQUE_IN_FRAGMENT = 'SYMBOL_NOT_UNIQUE_IN_FRAGMENT',
  NO_MATCHES = 'NO_MATCHES',
}

export interface FinderError {
  readonly code: FinderErrorCode;
  readonly message: string;
}

export type FinderResult =
  | { readonly success: true; readonly matches: readonly SymbolMatch[] }
  | { readonly success: false; readonly matches: readonly []; readonly error: FinderError };

export interface FinderOptions {
  readonly code: string;
  readonly symbol: string;
  readonly fragment: string;
}

export interface SymbolFinderOptions {
  readonly contextLines?: number;
}

export type OutputFormat = 'json' | 'llm';

export interface Formatter {
  format(result: FinderResult): string;
}
