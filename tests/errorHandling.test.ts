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
});
// TODO: добавить тесты на отсутствие символа во фрагменте
// TODO: добавить тесты, проверяющие поведение модуля при вхождение в символ недопустимых знаков, например, скобки, пробелы и т.д
