import { SymbolFinder } from '../src/symbolFinder';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Basic functionality', () => {
    it('should find a function call matching the fragment', () => {
      const code = `
function hello() {
  console.log('Hello');
}

hello();
      `;
      const result = finder.find({
        code,
        symbol: 'hello',
        fragment: 'hello();'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(6);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('hello');
    });

    it('should find function definition matching the fragment', () => {
      const code = `
function add(a, b) {
  return a + b;
}

const result = add(2, 3);
      `;
      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'function add(a, b) {'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(10);
      expect(result.matches[0]?.symbol).toBe('add');
    });

    it('should find class method call matching the fragment', () => {
      const code = `
class Calculator {
  add(a, b) {
    return a + b;
  }
}

const calc = new Calculator();
calc.add(5, 10);
      `;
      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'calc.add(5, 10);'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(9);
      expect(result.matches[0]?.position.column).toBe(6);
      expect(result.matches[0]?.symbol).toBe('add');
    });
  });
});
