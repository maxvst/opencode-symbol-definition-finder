import { SemanticLspTransformer } from '../src/semantic-lsp-transformer/SemanticLspTransformer';

describe('SemanticLspTransformer', () => {
  let finder: SemanticLspTransformer;

  beforeEach(() => {
    finder = new SemanticLspTransformer();
  });

  describe('Multiline fragment handling', () => {
    it('should find symbol when fragment spans multiple lines matching code', () => {
      const code = [
        'function process(data) {',
        '  const result = transform(data);',
        '  return result;',
        '}',
        '',
        'const output = process(input);',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'transform',
        fragment: 'const result = transform(data);\n  return result;',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(18);
      expect(result.matches[0]?.symbol).toBe('transform');
    });

    it('should find symbol when fragment is on a single line but code has line breaks', () => {
      const code = [
        'function greet(name) {',
        '  return "Hello, " + name;',
        '}',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'greet',
        fragment: 'function greet(name) { return "Hello, " + name; }',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(1);
      expect(result.matches[0]?.position.column).toBe(10);
      expect(result.matches[0]?.symbol).toBe('greet');
    });

    it('should find symbol when code is single line but fragment has line breaks', () => {
      const code = 'function add(a, b) { return a + b; }';

      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'function add(a, b) {\n  return a + b;\n}',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(1);
      expect(result.matches[0]?.position.column).toBe(10);
      expect(result.matches[0]?.symbol).toBe('add');
    });
  });

  describe('Missing line breaks in fragment', () => {
    it('should find symbol when fragment has no line breaks but code is multiline', () => {
      const code = [
        'class Calculator {',
        '  add(a, b) {',
        '    return a + b;',
        '  }',
        '}',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'add',
        fragment: 'class Calculator { add(a, b) { return a + b; } }',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(3);
      expect(result.matches[0]?.symbol).toBe('add');
    });

    it('should find symbol when fragment collapses multiple lines into one', () => {
      const code = [
        'const items = getData();',
        'const filtered = filter(items);',
        'const sorted = sort(filtered);',
        'console.log(sorted);',
      ].join('\n');

      const result = finder.find({
        code,
        symbol: 'filter',
        fragment: 'const items = getData(); const filtered = filter(items);',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(18);
      expect(result.matches[0]?.symbol).toBe('filter');
    });
  });

  describe('Extra line breaks in fragment', () => {
    it('should find symbol when fragment has extra line breaks not in code', () => {
      const code = 'function init() { const x = loadData(); return x; }';

      const result = finder.find({
        code,
        symbol: 'loadData',
        fragment: 'function init() {\n  const x = loadData();\n  return x;\n}',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(1);
      expect(result.matches[0]?.position.column).toBe(29);
      expect(result.matches[0]?.symbol).toBe('loadData');
    });

    it('should find symbol when fragment breaks a single expression across lines', () => {
      const code = 'const value = compute(input);';

      const result = finder.find({
        code,
        symbol: 'compute',
        fragment: 'const value =\n  compute(\n    input\n  );',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(1);
      expect(result.matches[0]?.position.column).toBe(15);
      expect(result.matches[0]?.symbol).toBe('compute');
    });
  });

  describe('LF vs CRLF differences', () => {
    it('should find symbol when code uses LF and fragment uses CRLF', () => {
      const code = "function parse(input) {\n  const tokens = tokenize(input);\n  return tokens;\n}";

      const result = finder.find({
        code,
        symbol: 'tokenize',
        fragment: "function parse(input) {\r\n  const tokens = tokenize(input);\r\n  return tokens;\r\n}",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(18);
      expect(result.matches[0]?.symbol).toBe('tokenize');
    });

    it('should find symbol when code uses CRLF and fragment uses LF', () => {
      const code = "function render(data) {\r\n  const html = buildHtml(data);\r\n  return html;\r\n}";

      const result = finder.find({
        code,
        symbol: 'buildHtml',
        fragment: "function render(data) {\n  const html = buildHtml(data);\n  return html;\n}",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(16);
      expect(result.matches[0]?.symbol).toBe('buildHtml');
    });

    it('should find symbol with mixed line endings between code and fragment', () => {
      const code = "class Service {\r\n  fetch(url) {\n    return http(url);\r\n  }\n}";

      const result = finder.find({
        code,
        symbol: 'http',
        fragment: "class Service {\n  fetch(url) {\r\n    return http(url);\n  }\r\n}",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(3);
      expect(result.matches[0]?.position.column).toBe(12);
      expect(result.matches[0]?.symbol).toBe('http');
    });

    it('should find symbol when code has CRLF and fragment is single line', () => {
      const code = "function validate(value) {\r\n  const isValid = check(value);\r\n  return isValid;\r\n}";

      const result = finder.find({
        code,
        symbol: 'check',
        fragment: 'function validate(value) { const isValid = check(value); return isValid; }',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(19);
      expect(result.matches[0]?.symbol).toBe('check');
    });
  });
});
