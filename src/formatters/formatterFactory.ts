import { Formatter, OutputFormat } from '../types';
import { JsonFormatter } from './jsonFormatter';
import { LLMFormatter } from './llmFormatter';

export class FormatterFactory {
  private static formatters: Map<OutputFormat, () => Formatter> = new Map([
    ['json', () => new JsonFormatter()],
    ['llm', () => new LLMFormatter()]
  ]);

  static getFormatter(format: OutputFormat): Formatter {
    const formatterFactory = this.formatters.get(format);
    if (!formatterFactory) {
      throw new Error(`Unknown format: ${format}. Available formats: ${Array.from(this.formatters.keys()).join(', ')}`);
    }
    return formatterFactory();
  }

  static registerFormatter(format: OutputFormat, factory: () => Formatter): void {
    this.formatters.set(format, factory);
  }

  static getAvailableFormats(): OutputFormat[] {
    return Array.from(this.formatters.keys());
  }
}
