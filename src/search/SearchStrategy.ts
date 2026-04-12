import { SymbolMatch } from '../types';

export interface SearchStrategy {
  search(code: string, symbol: string, fragment: string, contextLines: number): SymbolMatch[];
}
