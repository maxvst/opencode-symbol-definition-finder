#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { SemanticLspTransformer } from './semantic-lsp-transformer/SemanticLspTransformer';
import { FormatterFactory } from './semantic-lsp-transformer/formatters/formatterFactory';

interface CLIOptions {
  file: string;
  symbol: string;
  fragment: string;
  format: string;
  bestEffort: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: Partial<CLIOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--file' || arg === '-f') {
      options.file = args[++i];
    } else if (arg === '--symbol' || arg === '-s') {
      options.symbol = args[++i];
    } else if (arg === '--fragment' || arg === '-F') {
      options.fragment = args[++i];
    } else if (arg === '--format' || arg === '-m') {
      options.format = args[++i];
    } else if (arg === '--best-effort' || arg === '-b') {
      options.bestEffort = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.file || !options.symbol || !options.fragment) {
    console.error('Error: Missing required arguments');
    printHelp();
    process.exit(1);
  }

  if (!options.format) {
    options.format = 'json';
  }

  if (options.bestEffort === undefined) {
    options.bestEffort = false;
  }

  return options as CLIOptions;
}

function printHelp(): void {
  console.log(`
Symbol Finder - Find symbol positions in code

Usage: symbol-finder [options]

Options:
  -f, --file <path>       Path to the code file (required)
  -s, --symbol <name>     Symbol name to find (required)
  -F, --fragment <code>   Code fragment where the symbol is used (required)
  -m, --format <format>   Output format: json | llm | lsp (default: json)
  -b, --best-effort       Always return one position with best-effort fallback
  -h, --help              Show this help message

Examples:
  symbol-finder -f src/app.ts -s myFunction -F "myFunction(arg1, arg2)"
  symbol-finder --file code.py --symbol MyClass --fragment "MyClass()" --format llm
`);
}

function resolveAndReadFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  return fs.readFileSync(absolutePath, 'utf-8');
}

function validateFormat(format: string, factory: FormatterFactory): string {
  const availableFormats = factory.getAvailableFormats();
  if (!availableFormats.includes(format)) {
    console.error(`Error: Invalid format '${format}'. Available formats: ${availableFormats.join(', ')}`);
    process.exit(1);
  }
  return format;
}

function main(): void {
  const options = parseArgs();
  const factory = new FormatterFactory();

  const code = resolveAndReadFile(options.file);
  validateFormat(options.format, factory);

  const finder = new SemanticLspTransformer();
  const result = finder.find({
    code,
    symbol: options.symbol,
    fragment: options.fragment,
    bestEffort: options.bestEffort,
  });

  const formatter = factory.getFormatter(options.format);
  const output = formatter.format(result);

  console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
}

main();
