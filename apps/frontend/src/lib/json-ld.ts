const UNSAFE_JSON_LD_CHARS: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serializes structured data for a `<script type="application/ld+json">` body.
 * Escapes characters that could close the script element or break parsing,
 * so values containing `</script>` cannot inject markup.
 */
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data) ?? 'null';
  return json.replace(/[<>&\u2028\u2029]/g, (char) => UNSAFE_JSON_LD_CHARS[char]);
}
