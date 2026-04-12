import { SymbolFinder } from '../src/symbolFinder';
import * as fs from 'fs';
import * as path from 'path';

describe('SymbolFinder', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
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

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);

      const callMatch = result.matches.find(m => m.position.line === 45);
      expect(callMatch).toBeDefined();
      expect(callMatch?.position.column).toBe(23);
      expect(callMatch?.symbol).toBe('add');
    });

    it('should find symbols in TypeScript fixture', () => {
      const tsFile = path.join(fixturesDir, 'userService.ts');
      const code = fs.readFileSync(tsFile, 'utf-8');

      const result = finder.find({
        code,
        symbol: 'findUserById',
        fragment: 'findUserById(id: number)'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(14);
      expect(result.matches[0]?.position.column).toBe(3);
      expect(result.matches[0]?.symbol).toBe('findUserById');
    });

    it('should find symbols in Python fixture', () => {
      const pyFile = path.join(fixturesDir, 'dataProcessor.py');
      const code = fs.readFileSync(pyFile, 'utf-8');

      const result = finder.find({
        code,
        symbol: 'process_item',
        fragment: 'return [self.process_item(item) for item in items]'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);

      const usageMatch = result.matches.find(m => m.position.line === 18);
      expect(usageMatch).toBeDefined();
      expect(usageMatch?.position.column).toBe(22);
      expect(usageMatch?.symbol).toBe('process_item');
    });
  });
});
