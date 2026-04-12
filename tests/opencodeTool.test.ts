import definition from '../src/opencode-tool';
import * as path from 'path';

const FIXTURE_DIR = path.resolve(__dirname, 'e2e/fixtures/sample-project');

describe('opencode-tool execute', () => {
  const context = { directory: FIXTURE_DIR, worktree: FIXTURE_DIR };

  it('should return formatted error when file does not exist', async () => {
    const result = await definition.execute(
      { file: 'nonexistent.ts', symbol: 'foo', fragment: 'foo()' },
      context
    );

    expect(result).toContain('STATUS: ERROR');
    expect(result).toContain('FILE_NOT_FOUND');
    expect(result).toContain('nonexistent.ts');
  });

  it('should return formatted error when file path is completely wrong', async () => {
    const result = await definition.execute(
      { file: '/invalid/path/to/file.ts', symbol: 'bar', fragment: 'bar()' },
      context
    );

    expect(result).toContain('STATUS: ERROR');
    expect(result).toContain('FILE_NOT_FOUND');
  });

  it('should find symbol in existing file', async () => {
    const result = await definition.execute(
      { file: 'src/calculator.ts', symbol: 'add', fragment: 'add(2, 3)' },
      context
    );

    expect(result).toContain('STATUS: FOUND');
    expect(result).toContain('SYMBOL: add');
  });

  it('should return NOT_FOUND when symbol does not match any occurrence', async () => {
    const result = await definition.execute(
      { file: 'src/calculator.ts', symbol: 'nonexistent', fragment: 'nonexistent()' },
      context
    );

    expect(result).toContain('STATUS: NOT_FOUND');
  });

  it('should use process.cwd() when context.directory is not provided', async () => {
    const cwdContext = { directory: '', worktree: '' };
    const result = await definition.execute(
      { file: 'absolutely-no-file.ts', symbol: 'foo', fragment: 'foo()' },
      cwdContext
    );

    expect(result).toContain('STATUS: ERROR');
    expect(result).toContain('FILE_NOT_FOUND');
  });

  describe('bestEffort=true', () => {
    it('should return fallback position with error when file not found', async () => {
      const result = await definition.execute(
        { file: 'nonexistent.ts', symbol: 'foo', fragment: 'foo()', bestEffort: true },
        context
      );

      expect(result).toContain('STATUS: FOUND');
      expect(result).toContain('LINE: 1');
      expect(result).toContain('COLUMN: 1');
      expect(result).toContain('ERRORS:');
      expect(result).toContain('FILE_NOT_FOUND');
    });

    it('should return single match without errors or warnings when symbol found', async () => {
      const result = await definition.execute(
        { file: 'src/calculator.ts', symbol: 'add', fragment: 'add(2, 3)', bestEffort: true },
        context
      );

      expect(result).toContain('STATUS: FOUND');
      expect(result).toContain('SYMBOL: add');
      expect(result).not.toContain('ERRORS:');
      expect(result).not.toContain('WARNINGS:');
    });

    it('should return fallback with error when symbol not found in file', async () => {
      const result = await definition.execute(
        { file: 'src/calculator.ts', symbol: 'nonexistent', fragment: 'nonexistent()', bestEffort: true },
        context
      );

      expect(result).toContain('STATUS: FOUND');
      expect(result).toContain('LINE: 1');
      expect(result).toContain('COLUMN: 1');
      expect(result).toContain('ERRORS:');
      expect(result).toContain('NO_MATCHES');
    });
  });
});
