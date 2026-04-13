import { JsonFormatter } from '../src/semantic-lsp-transformer/formatters/jsonFormatter';
import { LLMFormatter } from '../src/semantic-lsp-transformer/formatters/llmFormatter';
import { LspFormatter } from '../src/semantic-lsp-transformer/formatters/lspFormatter';
import { FinderResult, FinderErrorCode, FinderWarningCode } from '../src/semantic-lsp-transformer/types';

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

  describe('LspFormatter', () => {
    let lspFormatter: LspFormatter;

    beforeEach(() => {
      lspFormatter = new LspFormatter();
    });

    describe('successful search', () => {
      it('should return typed result with single match', () => {
        const result: FinderResult = {
          matches: [
            {
              symbol: 'myFunction',
              position: { line: 10, column: 5 },
              context: 'const result = myFunction(arg);',
            },
          ],
          errors: [],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.matches).toHaveLength(1);
        expect(output.matches[0]!.symbol).toBe('myFunction');
        expect(output.matches[0]!.position).toEqual({ line: 10, column: 5 });
        expect(output.matches[0]!.context).toBe('const result = myFunction(arg);');
        expect(output.errors).toEqual([]);
        expect(output.warnings).toEqual([]);
      });

      it('should return typed result with multiple matches', () => {
        const result: FinderResult = {
          matches: [
            { symbol: 'func', position: { line: 1, column: 1 }, context: 'function func() {}' },
            { symbol: 'func', position: { line: 5, column: 10 }, context: 'func();' },
          ],
          errors: [],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.matches).toHaveLength(2);
        expect(output.matches[0]!.symbol).toBe('func');
        expect(output.matches[1]!.position.line).toBe(5);
        expect(output.matches[1]!.position.column).toBe(10);
      });

      it('should return empty matches when nothing found', () => {
        const result: FinderResult = {
          matches: [],
          errors: [],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.matches).toHaveLength(0);
        expect(output.errors).toHaveLength(0);
        expect(output.warnings).toHaveLength(0);
      });
    });

    describe('error formatting with message, cause, suggestion', () => {
      it('should format FILE_NOT_FOUND error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.FILE_NOT_FOUND, details: { file: 'src/app.ts' } }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors).toHaveLength(1);
        expect(output.errors[0]!.code).toBe('FILE_NOT_FOUND');
        expect(output.errors[0]!.message).toBe('File not found');
        expect(output.errors[0]!.cause).toContain('src/app.ts');
        expect(output.errors[0]!.suggestion).toContain('file path');
        expect(output.errors[0]!.suggestion).toContain('list directory');
        expect(output.errors[0]!.suggestion).toContain('search files');
      });

      it('should format EMPTY_CODE error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.EMPTY_CODE }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('EMPTY_CODE');
        expect(output.errors[0]!.message).toBe('Code is empty');
        expect(output.errors[0]!.cause).toBeTruthy();
        expect(output.errors[0]!.suggestion).toContain('file');
      });

      it('should format EMPTY_SYMBOL error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.EMPTY_SYMBOL }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('EMPTY_SYMBOL');
        expect(output.errors[0]!.message).toBe('Symbol is empty');
        expect(output.errors[0]!.suggestion).toContain('symbol');
        expect(output.errors[0]!.suggestion).toContain('myFunction');
      });

      it('should format EMPTY_FRAGMENT error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.EMPTY_FRAGMENT }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('EMPTY_FRAGMENT');
        expect(output.errors[0]!.message).toBe('Fragment is empty');
        expect(output.errors[0]!.suggestion).toContain('fragment');
      });

      it('should format INVALID_SYMBOL error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.INVALID_SYMBOL }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('INVALID_SYMBOL');
        expect(output.errors[0]!.message).toBe('Symbol contains invalid characters');
        expect(output.errors[0]!.suggestion).toContain('myFunction');
        expect(output.errors[0]!.cause).toContain('parentheses');
      });

      it('should format SYMBOL_NOT_IN_FRAGMENT error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.SYMBOL_NOT_IN_FRAGMENT }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('SYMBOL_NOT_IN_FRAGMENT');
        expect(output.errors[0]!.message).toBe('Symbol not found in fragment');
        expect(output.errors[0]!.suggestion).toContain('fragment');
        expect(output.errors[0]!.suggestion).toContain('symbol');
      });

      it('should format SYMBOL_NOT_UNIQUE_IN_FRAGMENT error', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.SYMBOL_NOT_UNIQUE_IN_FRAGMENT }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('SYMBOL_NOT_UNIQUE_IN_FRAGMENT');
        expect(output.errors[0]!.message).toBe('Symbol appears multiple times in fragment');
        expect(output.errors[0]!.suggestion).toContain('larger');
        expect(output.errors[0]!.suggestion).toContain('exactly once');
      });

      it('should format NO_MATCHES error with alternative tools suggestion', () => {
        const result: FinderResult = {
          matches: [],
          errors: [{ code: FinderErrorCode.NO_MATCHES }],
          warnings: [],
        };

        const output = lspFormatter.format(result);

        expect(output.errors[0]!.code).toBe('NO_MATCHES');
        expect(output.errors[0]!.message).toBe('No matches found');
        expect(output.errors[0]!.suggestion).toContain('read file');
        expect(output.errors[0]!.suggestion).toContain('search in files');
      });
    });

    describe('warning formatting with message, cause, suggestion', () => {
      it('should format MULTIPLE_MATCHES warning', () => {
        const result: FinderResult = {
          matches: [
            { symbol: 'foo', position: { line: 1, column: 1 }, context: 'foo()' },
          ],
          errors: [],
          warnings: [
            { code: FinderWarningCode.MULTIPLE_MATCHES, details: { totalMatches: 3, lines: '1,5,10' } },
          ],
        };

        const output = lspFormatter.format(result);

        expect(output.warnings).toHaveLength(1);
        expect(output.warnings[0]!.code).toBe('MULTIPLE_MATCHES');
        expect(output.warnings[0]!.message).toBe('Multiple matches found');
        expect(output.warnings[0]!.cause).toContain('3');
        expect(output.warnings[0]!.cause).toContain('1,5,10');
        expect(output.warnings[0]!.suggestion).toContain('fragment');
      });

      it('should format FRAGMENT_FALLBACK warning', () => {
        const result: FinderResult = {
          matches: [
            { symbol: 'foo', position: { line: 5, column: 1 }, context: 'foo()' },
          ],
          errors: [],
          warnings: [
            { code: FinderWarningCode.FRAGMENT_FALLBACK, details: { reason: 'EMPTY_FRAGMENT' } },
          ],
        };

        const output = lspFormatter.format(result);

        expect(output.warnings).toHaveLength(1);
        expect(output.warnings[0]!.code).toBe('FRAGMENT_FALLBACK');
        expect(output.warnings[0]!.message).toBe('Fragment fallback');
        expect(output.warnings[0]!.cause).toContain('EMPTY_FRAGMENT');
        expect(output.warnings[0]!.suggestion).toContain('fragment');
      });
    });

    describe('combined result (bestEffort scenario)', () => {
      it('should format result with matches, errors, and warnings together', () => {
        const result: FinderResult = {
          matches: [
            { symbol: '', position: { line: 1, column: 1 }, context: '' },
          ],
          errors: [{ code: FinderErrorCode.NO_MATCHES }],
          warnings: [
            { code: FinderWarningCode.FRAGMENT_FALLBACK, details: { reason: 'EMPTY_FRAGMENT' } },
          ],
        };

        const output = lspFormatter.format(result);

        expect(output.matches).toHaveLength(1);
        expect(output.errors).toHaveLength(1);
        expect(output.warnings).toHaveLength(1);
        expect(output.errors[0]!.code).toBe('NO_MATCHES');
        expect(output.warnings[0]!.code).toBe('FRAGMENT_FALLBACK');
      });
    });

    describe('structural validation', () => {
      const ALL_ERROR_CODES = Object.values(FinderErrorCode);
      const ALL_WARNING_CODES = Object.values(FinderWarningCode);

      it('every error code produces non-empty message, cause, and suggestion', () => {
        ALL_ERROR_CODES.forEach((code) => {
          const result: FinderResult = {
            matches: [],
            errors: [{ code, details: { file: 'test.ts' } }],
            warnings: [],
          };

          const output = lspFormatter.format(result);

          expect(output.errors).toHaveLength(1);
          const issue = output.errors[0]!;
          expect(issue.code).toBe(code);
          expect(issue.message.length).toBeGreaterThan(0);
          expect(issue.cause.length).toBeGreaterThan(0);
          expect(issue.suggestion.length).toBeGreaterThan(0);
        });
      });

      it('every warning code produces non-empty message, cause, and suggestion', () => {
        ALL_WARNING_CODES.forEach((code) => {
          const result: FinderResult = {
            matches: [
              { symbol: 'foo', position: { line: 1, column: 1 }, context: 'foo()' },
            ],
            errors: [],
            warnings: [
              { code, details: { reason: 'EMPTY_FRAGMENT', totalMatches: 2, lines: '1,3' } },
            ],
          };

          const output = lspFormatter.format(result);

          expect(output.warnings).toHaveLength(1);
          const issue = output.warnings[0]!;
          expect(issue.code).toBe(code);
          expect(issue.message.length).toBeGreaterThan(0);
          expect(issue.cause.length).toBeGreaterThan(0);
          expect(issue.suggestion.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
