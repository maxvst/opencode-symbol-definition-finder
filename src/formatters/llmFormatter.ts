import { Formatter, FinderResult } from '../types';

export class LLMFormatter implements Formatter {
  format(result: FinderResult): string {
    const lines: string[] = [];

    if (!result.success) {
      lines.push('STATUS: ERROR');
      lines.push(`ERROR_CODE: ${result.error.code}`);
      lines.push(`ERROR: ${result.error.message}`);
      return lines.join('\n');
    }

    if (result.matches.length === 0) {
      lines.push('STATUS: NOT_FOUND');
      return lines.join('\n');
    }

    lines.push('STATUS: FOUND');
    lines.push(`MATCH_COUNT: ${result.matches.length}`);
    lines.push('');
    lines.push('MATCHES:');

    result.matches.forEach((match, index) => {
      lines.push(`  - MATCH_${index + 1}:`);
      lines.push(`      SYMBOL: ${match.symbol}`);
      lines.push(`      LINE: ${match.position.line}`);
      lines.push(`      COLUMN: ${match.position.column}`);
      lines.push(`      CONTEXT: |`);
      match.context.split('\n').forEach(contextLine => {
        lines.push(`        ${contextLine}`);
      });
      lines.push('');
    });

    return lines.join('\n');
  }
}
