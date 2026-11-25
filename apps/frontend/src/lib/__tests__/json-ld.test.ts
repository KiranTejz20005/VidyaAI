import { serializeJsonLd } from '../json-ld';

describe('serializeJsonLd', () => {
  it('produces JSON that parses back to the original value', () => {
    const data = { '@type': 'FAQPage', name: 'A & B <c> \u2028 \u2029', list: [1, 'two'] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('cannot close the surrounding script element', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('escapes ampersands and line/paragraph separators', () => {
    const out = serializeJsonLd({ a: '&amp;', b: '\u2028\u2029' });
    expect(out).not.toContain('&');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u0026amp;');
    expect(out).toContain('\\u2028\\u2029');
  });

  it('serializes undefined as null instead of throwing', () => {
    expect(serializeJsonLd(undefined)).toBe('null');
  });
});
