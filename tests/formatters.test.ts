import { JsonFormatter } from '../src/formatters/jsonFormatter';
import { LLMFormatter } from '../src/formatters/llmFormatter';
import { FinderResult, FinderErrorCode, FinderWarningCode } from '../src/types';

describe('Formatters', () => {
  describe('JsonFormatter', () => {
    let formatter: JsonFormatter;

    beforeEach(() => {
      formatter = new JsonFormatter();
    });

    it('should format result with matches and empty errors/warnings', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'testFunc',
            position: { line: 5, column: 10 },
            context: 'function testFunc() {}'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.matches).toHaveLength(1);
      expect(parsed.matches[0].symbol).toBe('testFunc');
      expect(parsed.matches[0].position.line).toBe(5);
      expect(parsed.matches[0].position.column).toBe(10);
      expect(parsed.matches[0].context).toBe('function testFunc() {}');
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual([]);
    });

    it('should format result with no matches', () => {
      const result: FinderResult = {
        matches: [],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.matches).toHaveLength(0);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual([]);
    });

    it('should format error result with code and message', () => {
      const result: FinderResult = {
        matches: [],
        errors: [{ code: FinderErrorCode.EMPTY_CODE }],
        warnings: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0].code).toBe('EMPTY_CODE');
      expect(parsed.errors[0].message).toBe('Code is empty');
      expect(parsed.matches).toHaveLength(0);
    });

    it('should format multiple matches with exact data', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'func',
            position: { line: 1, column: 1 },
            context: 'function func() {}'
          },
          {
            symbol: 'func',
            position: { line: 5, column: 10 },
            context: 'func();'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.matches).toHaveLength(2);
      expect(parsed.matches[0].symbol).toBe('func');
      expect(parsed.matches[0].position.line).toBe(1);
      expect(parsed.matches[0].position.column).toBe(1);
      expect(parsed.matches[0].context).toBe('function func() {}');
      expect(parsed.matches[1].symbol).toBe('func');
      expect(parsed.matches[1].position.line).toBe(5);
      expect(parsed.matches[1].position.column).toBe(10);
      expect(parsed.matches[1].context).toBe('func();');
    });

    it('should include warnings in output', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'foo',
            position: { line: 1, column: 1 },
            context: 'foo()',
          },
        ],
        errors: [],
        warnings: [
          { code: FinderWarningCode.MULTIPLE_MATCHES, details: { totalMatches: 3, lines: '1,5,10' } },
        ],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.warnings).toHaveLength(1);
      expect(parsed.warnings[0].code).toBe('MULTIPLE_MATCHES');
      expect(parsed.warnings[0].totalMatches).toBe(3);
      expect(parsed.warnings[0].lines).toBe('1,5,10');
    });

    it('should include multiple warnings', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'foo',
            position: { line: 1, column: 1 },
            context: 'foo()',
          },
        ],
        errors: [],
        warnings: [
          { code: FinderWarningCode.FRAGMENT_FALLBACK, details: { reason: 'EMPTY_FRAGMENT' } },
          { code: FinderWarningCode.MULTIPLE_MATCHES, details: { totalMatches: 2, lines: '1,3' } },
        ],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.warnings).toHaveLength(2);
      expect(parsed.warnings[0].code).toBe('FRAGMENT_FALLBACK');
      expect(parsed.warnings[1].code).toBe('MULTIPLE_MATCHES');
    });

    it('should include errors with matches (bestEffort fallback)', () => {
      const result: FinderResult = {
        matches: [
          { symbol: '', position: { line: 1, column: 1 }, context: '' },
        ],
        errors: [{ code: FinderErrorCode.NO_MATCHES }],
        warnings: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.matches).toHaveLength(1);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0].code).toBe('NO_MATCHES');
    });
  });

  describe('LLMFormatter', () => {
    let formatter: LLMFormatter;

    beforeEach(() => {
      formatter = new LLMFormatter();
    });

    it('should format result with single match', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'myFunction',
            position: { line: 10, column: 5 },
            context: 'const result = myFunction(arg);'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: FOUND');
      expect(output).toContain('MATCH_COUNT: 1');
      expect(output).toContain('MATCH_1:');
      expect(output).toContain('SYMBOL: myFunction');
      expect(output).toContain('LINE: 10');
      expect(output).toContain('COLUMN: 5');
      expect(output).toContain('CONTEXT:');
      expect(output).toContain('const result = myFunction(arg);');
      expect(output).not.toContain('WARNINGS:');
      expect(output).not.toContain('ERRORS:');
    });

    it('should format result with no matches and no errors', () => {
      const result: FinderResult = {
        matches: [],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: NOT_FOUND');
      expect(output).not.toContain('MATCH_');
    });

    it('should format error-only result (no matches)', () => {
      const result: FinderResult = {
        matches: [],
        errors: [{ code: FinderErrorCode.EMPTY_CODE }],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: ERROR');
      expect(output).toContain('ERROR_1_CODE: EMPTY_CODE');
      expect(output).toContain('ERROR_1:');
      expect(output).toContain('Code is empty');
      expect(output).not.toContain('MATCH_');
    });

    it('should format multi-line context with all lines', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'test',
            position: { line: 5, column: 1 },
            context: 'line1\nline2\nline3'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('line1');
      expect(output).toContain('line2');
      expect(output).toContain('line3');
    });

    it('should format multiple matches with sequential numbering', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'func',
            position: { line: 1, column: 1 },
            context: 'context1'
          },
          {
            symbol: 'func',
            position: { line: 2, column: 2 },
            context: 'context2'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('MATCH_COUNT: 2');
      expect(output).toContain('MATCH_1:');
      expect(output).toContain('MATCH_2:');

      const match1Index = output.indexOf('MATCH_1:');
      const match2Index = output.indexOf('MATCH_2:');
      expect(match1Index).toBeLessThan(match2Index);

      expect(output).toContain('context1');
      expect(output).toContain('context2');
    });

    it('should include exact position for each match', () => {
      const result: FinderResult = {
        matches: [
          {
            symbol: 'alpha',
            position: { line: 100, column: 50 },
            context: 'test'
          },
          {
            symbol: 'beta',
            position: { line: 200, column: 75 },
            context: 'test2'
          }
        ],
        errors: [],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('LINE: 100');
      expect(output).toContain('COLUMN: 50');
      expect(output).toContain('SYMBOL: alpha');
      expect(output).toContain('LINE: 200');
      expect(output).toContain('COLUMN: 75');
      expect(output).toContain('SYMBOL: beta');
    });

    it('should include ERRORS section when errors present with matches', () => {
      const result: FinderResult = {
        matches: [
          { symbol: '', position: { line: 1, column: 1 }, context: '' },
        ],
        errors: [{ code: FinderErrorCode.NO_MATCHES }],
        warnings: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: FOUND');
      expect(output).toContain('ERRORS:');
      expect(output).toContain('ERROR_1:');
      expect(output).toContain('NO_MATCHES');
    });

    it('should include WARNINGS section when warnings present', () => {
      const result: FinderResult = {
        matches: [
          { symbol: 'foo', position: { line: 1, column: 1 }, context: 'foo()' },
        ],
        errors: [],
        warnings: [
          { code: FinderWarningCode.MULTIPLE_MATCHES, details: { totalMatches: 3, lines: '1,5,10' } },
        ],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: FOUND');
      expect(output).toContain('WARNINGS:');
      expect(output).toContain('WARNING_1:');
      expect(output).toContain('MULTIPLE_MATCHES');
      expect(output).toContain('Multiple matches found (3)');
    });

    it('should format FRAGMENT_FALLBACK warning message', () => {
      const result: FinderResult = {
        matches: [
          { symbol: 'foo', position: { line: 5, column: 1 }, context: 'foo()' },
        ],
        errors: [],
        warnings: [
          { code: FinderWarningCode.FRAGMENT_FALLBACK, details: { reason: 'EMPTY_FRAGMENT' } },
        ],
      };

      const output = formatter.format(result);

      expect(output).toContain('FRAGMENT_FALLBACK');
      expect(output).toContain('Fragment was not usable');
    });
  });
});
