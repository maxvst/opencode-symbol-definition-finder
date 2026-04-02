import { SymbolFinder } from '../src/symbolFinder';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Multi-language support', () => {
    it('should work with Python code', () => {
      const pythonCode = `
def process_data(data):
    return data * 2

result = process_data(10)
      `;
      const result = finder.find({
        code: pythonCode,
        symbol: 'process_data',
        fragment: 'result = process_data(10)'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(5);
      expect(result.matches[0]?.position.column).toBe(10);
      expect(result.matches[0]?.symbol).toBe('process_data');
    });

    it('should work with C++ code', () => {
      const cppCode = `
int calculate(int x) {
    return x * 2;
}

int main() {
    int result = calculate(5);
    return 0;
}
      `;
      const result = finder.find({
        code: cppCode,
        symbol: 'calculate',
        fragment: 'int result = calculate(5);'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(7);
      expect(result.matches[0]?.position.column).toBe(18);
      expect(result.matches[0]?.symbol).toBe('calculate');
    });

    it('should work with TypeScript code', () => {
      const tsCode = `
interface User {
  id: number;
  name: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}\`;
}

const u: User = { id: 1, name: 'John' };
greet(u);
      `;
      const result = finder.find({
        code: tsCode,
        symbol: 'greet',
        fragment: 'greet(u);'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);

      expect(result.matches[0]?.position.line).toBe(12);
      expect(result.matches[0]?.position.column).toBe(1);
      expect(result.matches[0]?.symbol).toBe('greet');
    });
  });
});
