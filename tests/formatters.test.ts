import { JsonFormatter } from '../src/formatters/jsonFormatter';
import { LLMFormatter } from '../src/formatters/llmFormatter';
import { FinderResult } from '../src/types';

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
    });

    it('should format result with no matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [],
        error: 'No matches found'
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.matches).toHaveLength(0);
      expect(parsed.error).toBe('No matches found');
    });

    it('should format error result', () => {
      const result: FinderResult = {
        success: false,
        matches: [],
        error: 'Invalid input'
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Invalid input');
    });

    it('should format multiple matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [
          {
            symbol: 'func',
            position: { line: 1, column: 1 },
            context: 'line1'
          },
          {
            symbol: 'func',
            position: { line: 5, column: 10 },
            context: 'line5'
          }
        ]
      };

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.matches).toHaveLength(2);
    });
  });

  describe('LLMFormatter', () => {
    let formatter: LLMFormatter;

    beforeEach(() => {
      formatter = new LLMFormatter();
    });

    it('should format successful result with matches', () => {
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
      expect(output).toContain('SYMBOL: myFunction');
      expect(output).toContain('LINE: 10');
      expect(output).toContain('COLUMN: 5');
    });

    it('should format result with no matches', () => {
      const result: FinderResult = {
        success: true,
        matches: [],
        error: 'Symbol not found'
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: NOT_FOUND');
      expect(output).toContain('MESSAGE: Symbol not found');
    });

    it('should format error result', () => {
      const result: FinderResult = {
        success: false,
        matches: [],
        error: 'Code is empty'
      };

      const output = formatter.format(result);

      expect(output).toContain('STATUS: ERROR');
      expect(output).toContain('ERROR: Code is empty');
    });

    it('should format multi-line context properly', () => {
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
    });

    it('should format multiple matches', () => {
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

      expect(output).toContain('MATCH_1:');
      expect(output).toContain('MATCH_2:');
    });
  });
});
