// Best-effort JSON extraction from a model response. Handles a clean object,
// an accidental ```json code fence, or stray prose around the object. Returns
// null when nothing parseable is found — callers should degrade gracefully.
export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
