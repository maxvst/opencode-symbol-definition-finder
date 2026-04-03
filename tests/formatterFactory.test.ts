import { FormatterFactory } from '../src/formatters/formatterFactory';
import { JsonFormatter } from '../src/formatters/jsonFormatter';
import { LLMFormatter } from '../src/formatters/llmFormatter';
import { Formatter } from '../src/types';

describe('FormatterFactory', () => {
  let factory: FormatterFactory;

  beforeEach(() => {
    factory = new FormatterFactory();
  });

  it('should return JsonFormatter for json format', () => {
    const formatter = factory.getFormatter('json');
    expect(formatter).toBeInstanceOf(JsonFormatter);
  });

  it('should return LLMFormatter for llm format', () => {
    const formatter = factory.getFormatter('llm');
    expect(formatter).toBeInstanceOf(LLMFormatter);
  });

  it('should throw error for unknown format', () => {
    expect(() => {
      factory.getFormatter('unknown');
    }).toThrow('Unknown format: unknown');
  });

  it('should return available formats', () => {
    const formats = factory.getAvailableFormats();

    expect(formats).toContain('json');
    expect(formats).toContain('llm');
  });

  it('should allow registering custom formatters', () => {
    class CustomFormatter implements Formatter {
      format(): string {
        return 'custom output';
      }
    }

    factory.registerFormatter('custom', () => new CustomFormatter());

    const formatter = factory.getFormatter('custom');
    expect(formatter).toBeInstanceOf(CustomFormatter);
    expect(formatter.format({} as any)).toBe('custom output');

    const formats = factory.getAvailableFormats();
    expect(formats).toContain('custom');
  });
});
