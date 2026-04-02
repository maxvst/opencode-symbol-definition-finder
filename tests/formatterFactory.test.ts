import { FormatterFactory } from '../src/formatters/formatterFactory';
import { JsonFormatter } from '../src/formatters/jsonFormatter';
import { LLMFormatter } from '../src/formatters/llmFormatter';
import { Formatter, OutputFormat } from '../src/types';

describe('FormatterFactory', () => {
  it('should return JsonFormatter for json format', () => {
    const formatter = FormatterFactory.getFormatter('json');
    expect(formatter).toBeInstanceOf(JsonFormatter);
  });

  it('should return LLMFormatter for llm format', () => {
    const formatter = FormatterFactory.getFormatter('llm');
    expect(formatter).toBeInstanceOf(LLMFormatter);
  });

  it('should throw error for unknown format', () => {
    expect(() => {
      FormatterFactory.getFormatter('unknown' as OutputFormat);
    }).toThrow('Unknown format: unknown');
  });

  it('should return available formats', () => {
    const formats = FormatterFactory.getAvailableFormats();
    
    expect(formats).toContain('json');
    expect(formats).toContain('llm');
  });

  it('should allow registering custom formatters', () => {
    class CustomFormatter implements Formatter {
      format(): string {
        return 'custom output';
      }
    }

    FormatterFactory.registerFormatter('custom', () => new CustomFormatter());
    
    const formatter = FormatterFactory.getFormatter('custom' as OutputFormat);
    expect(formatter).toBeInstanceOf(CustomFormatter);
    expect(formatter.format({} as any)).toBe('custom output');
    
    const formats = FormatterFactory.getAvailableFormats();
    expect(formats).toContain('custom');
  });
});
