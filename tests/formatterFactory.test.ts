import { FormatterFactory } from '../src/semantic-lsp-transformer/formatters/formatterFactory';
import { JsonFormatter } from '../src/semantic-lsp-transformer/formatters/jsonFormatter';
import { LLMFormatter } from '../src/semantic-lsp-transformer/formatters/llmFormatter';
import { LspFormatter } from '../src/semantic-lsp-transformer/formatters/lspFormatter';
import { Formatter } from '../src/semantic-lsp-transformer/types';

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

  it('should return LspFormatter for lsp format', () => {
    const formatter = factory.getFormatter('lsp');
    expect(formatter).toBeInstanceOf(LspFormatter);
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
    expect(formats).toContain('lsp');
  });

  it('should allow registering custom formatters', () => {
    class CustomFormatter implements Formatter<string> {
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
