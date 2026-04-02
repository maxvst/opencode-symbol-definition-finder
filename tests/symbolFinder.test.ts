import { SymbolFinder } from '../src/symbolFinder';
import * as fs from 'fs';
import * as path from 'path';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('Basic functionality', () => {
    it('should find a simple function call', () => {
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
      expect(result.matches.length).toBeGreaterThan(0);
      
      const callMatch = result.matches.find(m => m.position.line === 6);
      expect(callMatch).toBeDefined();
      expect(callMatch?.position.column).toBe(1);
    });

    it('should find function definition', () => {
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
      expect(result.matches.length).toBeGreaterThan(0);
      
      const defMatch = result.matches.find(m => m.position.line === 2);
      expect(defMatch).toBeDefined();
    });

    it('should find class method', () => {
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
      expect(result.matches.length).toBeGreaterThan(0);
    });
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
      expect(result.matches.length).toBeGreaterThan(0);
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
      expect(result.matches.length).toBeGreaterThan(0);
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
      expect(result.matches.length).toBeGreaterThan(0);
    });
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

const sum = calculateTotal(products);
      `;
      const result = finder.find({
        code,
        symbol: 'calculateTotal',
        fragment: 'calculateTotal(products)'
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
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
      expect(result.matches.length).toBeGreaterThan(0);
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
        fragment: 'svc.fetchData();'
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple matches', () => {
    it('should return all occurrences of the symbol', () => {
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
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should handle same symbol in different contexts', () => {
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
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should return error for empty code', () => {
      const result = finder.find({
        code: '',
        symbol: 'test',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for empty symbol', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: '',
        fragment: 'test()'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for empty fragment', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'test',
        fragment: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle not found symbol gracefully', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'nonexistent',
        fragment: 'nonexistent()'
      });

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('Non-compilable code tolerance', () => {
    it('should work with syntax errors in code', () => {
      const brokenCode = `
function broken( {
  return missing
}

broken(
      `;
      const result = finder.find({
        code: brokenCode,
        symbol: 'broken',
        fragment: 'broken('
      });

      expect(result.success).toBe(true);
    });

    it('should work with incomplete code', () => {
      const incompleteCode = `
class Incomplete {
  method(
      `;
      const result = finder.find({
        code: incompleteCode,
        symbol: 'Incomplete',
        fragment: 'class Incomplete {'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Real-world fixtures', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    it('should find symbols in C++ fixture', () => {
      const cppFile = path.join(fixturesDir, 'calculator.cpp');
      const code = fs.readFileSync(cppFile, 'utf-8');
      
      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'double sum = calc.add(5.0, 3.0);'
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find symbols in TypeScript fixture', () => {
      const tsFile = path.join(fixturesDir, 'userService.ts');
      const code = fs.readFileSync(tsFile, 'utf-8');
      
      const result = finder.find({
        code,
        symbol: 'findUserById',
        fragment: 'return this.users.find(u => u.id === id);'
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find symbols in Python fixture', () => {
      const pyFile = path.join(fixturesDir, 'dataProcessor.py');
      const code = fs.readFileSync(pyFile, 'utf-8');
      
      const result = finder.find({
        code,
        symbol: 'process_item',
        fragment: 'return [self.process_item(item) for item in items]'
      });

      expect(result.success).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });
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

      expect(result.success).toBe(true);
      expect(result.matches[0]?.position.line).toBe(4);
    });

    it('should return correct column number (1-indexed)', () => {
      const code = `    function test() {}`;
      
      const result = finder.find({
        code,
        symbol: 'test',
        fragment: 'function test() {}'
      });

      expect(result.success).toBe(true);
      expect(result.matches[0]?.position.column).toBeGreaterThan(0);
    });
  });
});
