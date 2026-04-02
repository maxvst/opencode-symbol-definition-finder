import { SymbolFinder } from '../src/symbolFinder';

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
      expect(result.error).toBe('Code is empty');
      expect(result.matches).toHaveLength(0);
    });

    it('should return error for empty symbol', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: '',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Symbol is empty');
      expect(result.matches).toHaveLength(0);
    });

    it('should return error for empty fragment', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'test',
        fragment: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fragment is empty');
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
      expect(result.error).toBe('No matches found for the given symbol and fragment');
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
      expect(result.error).toBe('Symbol not found in fragment');
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
      expect(result.error).toBe('Symbol not found in fragment');
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when fragment is near symbol in code but does not contain symbol name', () => {
      const result = finder.find({
        code: 'function foo() { bar(); }',
        symbol: 'foo',
        fragment: 'bar()'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Symbol not found in fragment');
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
      expect(result.error).toBe('Symbol contains invalid characters');
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when symbol contains brackets', () => {
      const result = finder.find({
        code: 'test[0]',
        symbol: 'test[0]',
        fragment: 'test[0]'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Symbol contains invalid characters');
      expect(result.matches).toHaveLength(0);
    });

    it('should return error when symbol has leading and trailing spaces', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: ' test ',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Symbol contains invalid characters');
      expect(result.matches).toHaveLength(0);
    });
  });
});
