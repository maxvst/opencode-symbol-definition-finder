import { SemanticLspTransformer } from '../src/semantic-lsp-transformer/SemanticLspTransformer';

describe('SemanticLspTransformer', () => {
  let finder: SemanticLspTransformer;

  beforeEach(() => {
    finder = new SemanticLspTransformer();
  });

  describe('Non-compilable code tolerance', () => {
    it('should work with syntax errors in code', () => {
      const brokenCode = `
function broken( {
  return missing
}

broken(
      `;
      const result = finder.find({
        code: brokenCode,
        symbol: 'broken',
        fragment: 'broken('
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);

      const line2Match = result.matches.find(m => m.position.line === 2);
      expect(line2Match).toBeDefined();
      expect(line2Match?.position.column).toBe(10);
      expect(line2Match?.symbol).toBe('broken');
    });

    it('should work with incomplete code', () => {
      const incompleteCode = `
class Incomplete {
  method(
      `;
      const result = finder.find({
        code: incompleteCode,
        symbol: 'Incomplete',
        fragment: 'class Incomplete {'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.position.line).toBe(2);
      expect(result.matches[0]?.position.column).toBe(7);
      expect(result.matches[0]?.symbol).toBe('Incomplete');
    });
  });
});
