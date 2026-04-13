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
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
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
  readonly details?: Record<string, string>;
}

export enum FinderWarningCode {
  MULTIPLE_MATCHES = 'MULTIPLE_MATCHES',
  FRAGMENT_FALLBACK = 'FRAGMENT_FALLBACK',
}

export interface FinderWarning {
  readonly code: FinderWarningCode;
  readonly details?: Record<string, string | number>;
}

export interface FinderResult {
  readonly matches: readonly SymbolMatch[];
  readonly errors: readonly FinderError[];
  readonly warnings: readonly FinderWarning[];
}

export interface FinderOptions {
  readonly code: string;
  readonly symbol: string;
  readonly fragment: string;
  readonly bestEffort?: boolean;
}

export interface SemanticLspTransformerOptions {
  readonly contextLines?: number;
}

export type OutputFormat = 'json' | 'llm' | 'lsp';

export interface Formatter<T = string> {
  format(result: FinderResult): T;
}

export interface LspFormattedMatch {
  readonly symbol: string;
  readonly position: Position;
  readonly context: string;
}

export interface LspFormattedIssue {
  readonly code: string;
  readonly message: string;
  readonly cause: string;
  readonly suggestion: string;
}

export interface LspFormattedResult {
  readonly matches: readonly LspFormattedMatch[];
  readonly errors: readonly LspFormattedIssue[];
  readonly warnings: readonly LspFormattedIssue[];
}
