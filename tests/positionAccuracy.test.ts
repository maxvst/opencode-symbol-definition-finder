import { SymbolFinder } from '../src/symbolFinder';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Position accuracy', () => {
    it('should return correct line number (1-indexed)', () => {
      const code = `line1
line2
line3
function target() {}
line5`;

      const result = finder.find({
        code,
        symbol: 'target',
        fragment: 'function target() {}'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(4);
      expect(result.matches[0]?.position.column).toBe(10);
      expect(result.matches[0]?.symbol).toBe('target');
    });

    it('should return correct column number (1-indexed)', () => {
      const code = `    function test() {}`;

      const result = finder.find({
        code,
        symbol: 'test',
        fragment: 'function test() {}'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.column).toBe(14);
      expect(result.matches[0]?.position.line).toBe(1);
      expect(result.matches[0]?.symbol).toBe('test');
    });
  });
});
