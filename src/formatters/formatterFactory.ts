import { Formatter, OutputFormat } from '../types';
import { JsonFormatter } from './jsonFormatter';
import { LLMFormatter } from './llmFormatter';
import { LspFormatter } from './lspFormatter';

const DEFAULT_FORMATTERS: ReadonlyMap<string, () => Formatter<unknown>> = new Map<string, () => Formatter<unknown>>([
  ['json', () => new JsonFormatter()],
  ['llm', () => new LLMFormatter()],
  ['lsp', () => new LspFormatter()],
]);

export class FormatterFactory {
  private readonly formatters: Map<string, () => Formatter<unknown>>;

  constructor(initial?: ReadonlyMap<string, () => Formatter<unknown>>) {
    this.formatters = new Map(initial ?? DEFAULT_FORMATTERS);
  }

  static readonly defaultFormatters: ReadonlyMap<OutputFormat, () => Formatter<unknown>> = DEFAULT_FORMATTERS as ReadonlyMap<OutputFormat, () => Formatter<unknown>>;

  getFormatter(format: string): Formatter<unknown> {
    const formatterFactory = this.formatters.get(format);
    if (!formatterFactory) {
      throw new Error(`Unknown format: ${format}. Available formats: ${Array.from(this.formatters.keys()).join(', ')}`);
    }
    return formatterFactory();
  }

  registerFormatter(format: string, factory: () => Formatter<unknown>): void {
    this.formatters.set(format, factory);
  }

  getAvailableFormats(): string[] {
    return Array.from(this.formatters.keys());
  }
}
