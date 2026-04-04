import { SymbolFinder } from '../src/symbolFinder';
import { FinderErrorCode } from '../src/types';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Error handling', () => {
    it('should return error for empty code', () => {
      const result = finder.find({
        code: '',
        symbol: 'test',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.EMPTY_CODE);
        expect(result.error.message).toBe('Code is empty. Provide the correct file path in the "file" parameter that points to a file containing source code.');
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error for empty symbol', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: '',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.EMPTY_SYMBOL);
        expect(result.error.message).toBe('Symbol is empty. Provide a valid symbol name (function, variable, or class name) in the "symbol" parameter.');
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error for empty fragment', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'test',
        fragment: ''
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.EMPTY_FRAGMENT);
        expect(result.error.message).toBe('Fragment is empty. Provide a code snippet containing the symbol in the "fragment" parameter to disambiguate between multiple occurrences.');
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should handle not found symbol gracefully', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'nonexistent',
        fragment: 'nonexistent()'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('Symbol absent from fragment', () => {
    it('should return error when symbol does not appear in fragment text', () => {
      const result = finder.find({
        code: 'function foo() {}',
        symbol: 'foo',
        fragment: 'bar()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT);
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when fragment is in code but does not contain the symbol', () => {
      const code = [
        'function foo() { return 1; }',
        '',
        '',
        '',
        'const result = bar();'
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'foo',
        fragment: 'bar()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT);
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when fragment is near symbol in code but does not contain symbol name', () => {
      const result = finder.find({
        code: 'function foo() { bar(); }',
        symbol: 'foo',
        fragment: 'bar()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT);
      }
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('Invalid characters in symbol', () => {
    it('should return error when symbol contains parentheses', () => {
      const result = finder.find({
        code: 'test()',
        symbol: 'test()',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.INVALID_SYMBOL);
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when symbol contains brackets', () => {
      const result = finder.find({
        code: 'test[0]',
        symbol: 'test[0]',
        fragment: 'test[0]'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.INVALID_SYMBOL);
      }
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when symbol has leading and trailing spaces', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: ' test ',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(FinderErrorCode.INVALID_SYMBOL);
      }
      expect(result.matches).toHaveLength(0);
    });
  });
});
