import { Formatter, OutputFormat } from '../types';
import { JsonFormatter } from './jsonFormatter';
import { LLMFormatter } from './llmFormatter';

const DEFAULT_FORMATTERS: ReadonlyMap<string, () => Formatter> = new Map([
  ['json', () => new JsonFormatter()],
  ['llm', () => new LLMFormatter()],
]);

export class FormatterFactory {
  private readonly formatters: Map<string, () => Formatter>;

  constructor(initial?: ReadonlyMap<string, () => Formatter>) {
    this.formatters = new Map(initial ?? DEFAULT_FORMATTERS);
  }

  static readonly defaultFormatters: ReadonlyMap<OutputFormat, () => Formatter> = DEFAULT_FORMATTERS as ReadonlyMap<OutputFormat, () => Formatter>;

  getFormatter(format: string): Formatter {
    const formatterFactory = this.formatters.get(format);
    if (!formatterFactory) {
      throw new Error(`Unknown format: ${format}. Available formats: ${Array.from(this.formatters.keys()).join(', ')}`);
    }
    return formatterFactory();
  }

  registerFormatter(format: string, factory: () => Formatter): void {
    this.formatters.set(format, factory);
  }

  getAvailableFormats(): string[] {
    return Array.from(this.formatters.keys());
  }
}
