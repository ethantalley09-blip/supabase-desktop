import { describe, expect, it } from 'vitest';
import { extractJson } from './extractJson';

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('recovers JSON wrapped in a code fence or prose', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(extractJson('Here you go:\n{"label":"Ward 3","filters":{"ward":"3"}}\nThanks!')).toEqual({
      label: 'Ward 3',
      filters: { ward: '3' }
    });
  });

  it('returns null when there is no parseable object', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ not valid }')).toBeNull();
  });
});
