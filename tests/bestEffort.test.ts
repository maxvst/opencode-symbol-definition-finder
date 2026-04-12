import { SymbolFinder } from '../src/symbolFinder';
import { FinderErrorCode, FinderWarningCode } from '../src/types';

describe('SymbolFinder bestEffort', () => {
  let finder: SymbolFinder;

  beforeEach(() => {
    finder = new SymbolFinder();
  });

  describe('bestEffort=false (unchanged behavior)', () => {
    it('should return error for empty symbol', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: '',
        fragment: 'test()',
        bestEffort: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe(FinderErrorCode.EMPTY_SYMBOL);
      expect(result.matches).toHaveLength(0);
    });

    it('should return error for empty fragment', () => {
      const result = finder.find({
        code: 'function test() {}',
        symbol: 'test',
        fragment: '',
        bestEffort: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe(FinderErrorCode.EMPTY_FRAGMENT);
      expect(result.matches).toHaveLength(0);
    });

    it('should return multiple matches without errors or warnings', () => {
      const code = [
        'const x = getValue();',
        'const y = getValue();',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'getValue',
        fragment: 'getValue()',
        bestEffort: false,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('bestEffort=true — single match (happy path)', () => {
    it('should return one match without errors or warnings', () => {
      const code = [
        'function hello() {',
        '  console.log("Hello");',
        '}',
        '',
        'hello();',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'hello',
        fragment: 'hello();',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(5);
      expect(result.matches[0]!.position.column).toBe(1);
    });
  });

  describe('bestEffort=true — multiple matches', () => {
    it('should return first match with MULTIPLE_MATCHES warning', () => {
      const code = [
        'const x = getValue();',
        'const y = getValue();',
        'const z = getValue();',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'getValue',
        fragment: 'getValue()',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(11);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.MULTIPLE_MATCHES);
      expect(result.warnings[0]!.details?.['totalMatches']).toBe(3);
      expect(result.warnings[0]!.details?.['lines']).toBe('1,2,3');
    });

    it('should return first match with line numbers in warning', () => {
      const code = [
        'class Service {',
        '  getData() { return fetch(url); }',
        '  processData() { return fetch(url); }',
        '}',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'fetch',
        fragment: 'fetch(url)',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(2);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.MULTIPLE_MATCHES);
    });
  });

  describe('bestEffort=true — empty fragment', () => {
    it('should search by symbol alone with FRAGMENT_FALLBACK warning', () => {
      const code = 'function test() { return 1; }';

      const result = finder.find({
        code,
        symbol: 'test',
        fragment: '',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
      expect(result.warnings[0]!.details?.['reason']).toBe('EMPTY_FRAGMENT');
    });

    it('should return first match when fragment empty and multiple occurrences', () => {
      const code = [
        'log("first");',
        'log("second");',
        'log("third");',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'log',
        fragment: '',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
      expect(result.warnings[1]!.code).toBe(FinderWarningCode.MULTIPLE_MATCHES);
    });

    it('should return fallback with error when fragment empty and no occurrences', () => {
      const code = 'function test() { return 1; }';

      const result = finder.find({
        code,
        symbol: 'nonexistent',
        fragment: '',
        bestEffort: true,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.NO_MATCHES);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
    });

    it('should treat whitespace-only fragment as empty', () => {
      const code = 'const x = foo();';

      const result = finder.find({
        code,
        symbol: 'foo',
        fragment: '   ',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
    });
  });

  describe('bestEffort=true — empty symbol', () => {
    it('should return fallback position with EMPTY_SYMBOL error', () => {
      const code = 'function test() { return 1; }';

      const result = finder.find({
        code,
        symbol: '',
        fragment: 'test()',
        bestEffort: true,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.EMPTY_SYMBOL);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return fallback for whitespace-only symbol', () => {
      const code = 'function test() { return 1; }';

      const result = finder.find({
        code,
        symbol: '   ',
        fragment: 'test()',
        bestEffort: true,
      });

      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.EMPTY_SYMBOL);
    });
  });

  describe('bestEffort=true — empty code', () => {
    it('should return fallback position with EMPTY_CODE error', () => {
      const result = finder.find({
        code: '',
        symbol: 'test',
        fragment: 'test()',
        bestEffort: true,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(1);
      expect(result.matches[0]!.context).toBe('');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.EMPTY_CODE);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return fallback for whitespace-only code', () => {
      const result = finder.find({
        code: '   ',
        symbol: 'test',
        fragment: 'test()',
        bestEffort: true,
      });

      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.EMPTY_CODE);
    });
  });

  describe('bestEffort=true — symbol not in fragment', () => {
    it('should search by symbol with FRAGMENT_FALLBACK warning', () => {
      const code = 'function foo() { return 1; }';

      const result = finder.find({
        code,
        symbol: 'foo',
        fragment: 'bar()',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
      expect(result.warnings[0]!.details?.['reason']).toBe('SYMBOL_NOT_IN_FRAGMENT');
    });

    it('should return single match when symbol not in fragment but found in code', () => {
      const code = 'function foo() { return 1; }';

      const result = finder.find({
        code,
        symbol: 'foo',
        fragment: 'bar()',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
    });

    it('should add MULTIPLE_MATCHES when symbol appears multiple times without fragment', () => {
      const code = [
        'foo(1);',
        'foo(2);',
        'foo(3);',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'foo',
        fragment: 'bar()',
        bestEffort: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]!.code).toBe(FinderWarningCode.FRAGMENT_FALLBACK);
      expect(result.warnings[1]!.code).toBe(FinderWarningCode.MULTIPLE_MATCHES);
    });
  });

  describe('bestEffort=true — no matches found', () => {
    it('should return fallback when valid input finds nothing', () => {
      const code = 'function test() { return 1; }';

      const result = finder.find({
        code,
        symbol: 'nonexistent',
        fragment: 'nonexistent()',
        bestEffort: true,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.position.line).toBe(1);
      expect(result.matches[0]!.position.column).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe(FinderErrorCode.NO_MATCHES);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('bestEffort=true — fallback match content', () => {
    it('should include first 7 lines of code as context in fallback', () => {
      const code = [
        'line1',
        'line2',
        'line3',
        'line4',
        'line5',
        'line6',
        'line7',
        'line8',
        'line9',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: '',
        fragment: '',
        bestEffort: true,
      });

      const contextLines = result.matches[0]!.context.split('\n');
      expect(contextLines).toHaveLength(7);
      expect(contextLines[0]).toBe('line1');
      expect(contextLines[6]).toBe('line7');
    });
  });
});
