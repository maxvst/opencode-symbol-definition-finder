import { SymbolFinder } from '../src/symbolFinder';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Formatting tolerance', () => {
    it('should handle missing whitespace in fragment', () => {
      const code = `
function calculateTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
}

const sum = calculateTotal ( products );
      `;
      const result = finder.find({
        code,
        symbol: 'calculateTotal',
        fragment: 'calculateTotal(products)'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(10);
      expect(result.matches[0]?.position.column).toBe(13);
      expect(result.matches[0]?.symbol).toBe('calculateTotal');
    });

    it('should handle extra whitespace in fragment', () => {
      const code = `
function add(a, b) {
  return a + b;
}

add(1, 2);
      `;
      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'add  (  1  ,  2  )  ;'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(6);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('add');
    });

    it('should handle different indentation', () => {
      const code = `
class Service {
    fetchData() {
        return fetch('/api/data');
    }
}

const svc = new Service();
svc.fetchData();
      `;
      const result = finder.find({
        code,
        symbol: 'fetchData',
        fragment: "\t\tsvc.fetchData();"
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(9);
      expect(result.matches[0]?.position.column).toBe(5);
      expect(result.matches[0]?.symbol).toBe('fetchData');
    });
  });
});
