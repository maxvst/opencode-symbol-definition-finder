import { JsonFormatter } from '../src/formatters/jsonFormatter';
import { LLMFormatter } from '../src/formatters/llmFormatter';
import { FinderResult, FinderErrorCode } from '../src/types';

describe('Formatters', () => {
  describe('JsonFormatter', () => {
    let formatter: JsonFormatter;

    beforeEach(() => {
      formatter = new JsonFormatter();
    });

    it('should format successful result with matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [
          {
            symbol: 'testFunc',
            position: { line: 5, column: 10 },
            context: 'function testFunc() {}'
          }
        ]
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.matches).toHaveLength(1);
      expect(parsed.matches[0].symbol).toBe('testFunc');
      expect(parsed.matches[0].position.line).toBe(5);
      expect(parsed.matches[0].position.column).toBe(10);
      expect(parsed.matches[0].context).toBe('function testFunc() {}');
      expect(parsed.error).toBeUndefined();
    });

    it('should format result with no matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [],
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.matches).toHaveLength(0);
      expect(parsed.matches).toEqual([]);
      expect(parsed.error).toBeUndefined();
    });

    it('should format error result with code and message', () => {
      const result: FinderResult = {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.EMPTY_CODE, message: 'Code is empty' }
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.matches).toHaveLength(0);
      expect(parsed.error.code).toBe('EMPTY_CODE');
      expect(parsed.error.message).toBe('Code is empty');
    });

    it('should format multiple matches with exact data', () => {
      const result: FinderResult = {
        success: true,
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
        ]
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
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
  });

  describe('LLMFormatter', () => {
    let formatter: LLMFormatter;

    beforeEach(() => {
      formatter = new LLMFormatter();
    });

    it('should format successful result with single match', () => {
      const result: FinderResult = {
        success: true,
        matches: [
          {
            symbol: 'myFunction',
            position: { line: 10, column: 5 },
            context: 'const result = myFunction(arg);'
          }
        ]
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
    });

    it('should format result with no matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [],
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: NOT_FOUND');
      expect(output).not.toContain('MATCH_');
    });

    it('should format error result with code and message', () => {
      const result: FinderResult = {
        success: false,
        matches: [],
        error: { code: FinderErrorCode.EMPTY_CODE, message: 'Code is empty' }
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: ERROR');
      expect(output).toContain('ERROR_CODE: EMPTY_CODE');
      expect(output).toContain('ERROR: Code is empty');
      expect(output).not.toContain('MATCH_');
    });

    it('should format multi-line context with all lines', () => {
      const result: FinderResult = {
        success: true,
        matches: [
          {
            symbol: 'test',
            position: { line: 5, column: 1 },
            context: 'line1\nline2\nline3'
          }
        ]
      };

      const output = formatter.format(result);

      expect(output).toContain('line1');
      expect(output).toContain('line2');
      expect(output).toContain('line3');
      const line1Count = (output.match(/line1/g) || []).length;
      expect(line1Count).toBeGreaterThanOrEqual(1);
    });

    it('should format multiple matches with sequential numbering', () => {
      const result: FinderResult = {
        success: true,
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
        ]
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
        success: true,
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
        ]
      };

      const output = formatter.format(result);

      expect(output).toContain('LINE: 100');
      expect(output).toContain('COLUMN: 50');
      expect(output).toContain('SYMBOL: alpha');
      expect(output).toContain('LINE: 200');
      expect(output).toContain('COLUMN: 75');
      expect(output).toContain('SYMBOL: beta');
    });
  });
});
