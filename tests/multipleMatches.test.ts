import { SymbolFinder } from '../src/symbolFinder';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Multiple matches', () => {
    it('should return only the symbol matching the fragment', () => {
      const code = `
function log(message) {
  console.log(message);
}

log('first');
log('second');
log('third');
      `;
      const result = finder.find({
        code,
        symbol: 'log',
        fragment: "log('second');"
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(7);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('log');
    });

    it('should return all occurrences when fragment matches multiple', () => {
      const code = `
process(value);
x = 1;
process(value);
      `;
      const result = finder.find({
        code,
        symbol: 'process',
        fragment: 'process(value);'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(2);

      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('process');

      expect(result.matches[1]?.position.line).toBe(4);
      expect(result.matches[1]?.position.column).toBe(1);
      expect(result.matches[1]?.symbol).toBe('process');
    });

    it('should disambiguate same symbol in different contexts', () => {
      const code = `
class Handler {
  process(data) {
    return data;
  }
}

function process(item) {
  return item * 2;
}

const h = new Handler();
h.process(input);
process(value);
      `;
      const result = finder.find({
        code,
        symbol: 'process',
        fragment: 'process(value);'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(14);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('process');
    });
  });
});
// TODO: добавить тесты, которые находили бы в коде несколько заданных фрагментов и возвращали несколько позиций