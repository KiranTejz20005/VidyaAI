/**
 * Question labelling and answer-to-question matching.
 *
 * OCR returns answer text, not structure. These helpers recover structure from
 * the labels students write ("Q2 (b)", "3.a", "Ans 4") without relying on page
 * order, and report anything ambiguous instead of guessing.
 */

export interface Segment {
  /** Normalised label, e.g. "3.b" or "5". */
  label: string;
  text: string;
  /** Text the student struck out. Kept for audit, never evaluated. */
  struckText: string;
  /** The same label appeared more than once (continued or rewritten answer). */
  ambiguous: boolean;
  parts: number;
}

export interface SegmentationResult {
  segments: Segment[];
  /** Text before the first recognisable label. */
  unlabeled: string;
}

// number, optional delimiter, then any number of (a) / a) / (ii) sub-labels
const HEADER = /^\s*(?:((?:q(?:uestion)?|ans(?:wer)?))\s*\.?\s*)?(\d{1,3})\s*([.):\-]?)\s*((?:\(\s*[a-z]{1,4}\s*\)\s*|[a-z]\s*\)\s*)*)/i;
const STRUCK = /\[struck\]([\s\S]*?)\[\/struck\]/gi;

function subParts(raw: string): string[] {
  return [...raw.matchAll(/\(?\s*([a-z]{1,4})\s*\)/gi)].map((m) => m[1].toLowerCase());
}

function parseHeader(line: string): { label: string; rest: string } | null {
  const m = HEADER.exec(line);
  if (!m) return null;
  const [whole, prefix, number, delimiter, parts] = m;
  const hasParts = parts.trim().length > 0;
  // A bare number ("5 apples") is content, not a label.
  if (!prefix && !delimiter && !hasParts) return null;
  const rest = line.slice(whole.length);
  // "2.5 kg" is a decimal, not question 2 part 5.
  if (!prefix && delimiter === '.' && /^\d/.test(rest)) return null;
  return { label: [number, ...subParts(parts)].join('.'), rest: rest.trim() };
}

/** Normalises a question label such as "Q.2 (b)" to "2.b". Returns null if it is not a label. */
export function normalizeLabel(raw: string): string | null {
  const parsed = parseHeader(raw.trim());
  return parsed && parsed.rest === '' ? parsed.label : null;
}

export function segmentByLabels(text: string): SegmentationResult {
  const segments: Segment[] = [];
  const index = new Map<string, Segment>();
  let unlabeled = '';
  let current: Segment | null = null;

  for (const line of text.split(/\r?\n/)) {
    const header = parseHeader(line);
    if (header) {
      const existing = index.get(header.label);
      if (existing) {
        existing.ambiguous = true;
        existing.parts += 1;
        current = existing;
      } else {
        current = { label: header.label, text: '', struckText: '', ambiguous: false, parts: 1 };
        segments.push(current);
        index.set(header.label, current);
      }
      current.text += (current.text ? '\n' : '') + header.rest;
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line;
    } else {
      unlabeled += (unlabeled ? '\n' : '') + line;
    }
  }

  for (const s of segments) {
    const struck: string[] = [];
    s.text = s.text.replace(STRUCK, (_m, inner: string) => {
      struck.push(inner.trim());
      return '';
    });
    s.text = s.text.trim();
    s.struckText = struck.join('\n');
  }
  return { segments, unlabeled: unlabeled.trim() };
}

export interface QuestionRef {
  id: string;
  /** As printed on the paper, e.g. "Q3(b)". */
  label: string;
}

export interface QuestionMatch {
  questionId: string;
  status: 'MATCHED' | 'COMBINED_PARTS' | 'UNANSWERED';
  text: string;
  struckText: string;
  segmentLabels: string[];
  confidence: number;
  ambiguous: boolean;
}

export interface MatchResult {
  matches: QuestionMatch[];
  /** Answer labels that correspond to no question on the paper. */
  extraLabels: string[];
}

export function matchSegmentsToQuestions(segments: Segment[], questions: QuestionRef[]): MatchResult {
  const used = new Set<string>();
  const matches: QuestionMatch[] = questions.map((q) => {
    const label = normalizeLabel(q.label) ?? q.label.trim().toLowerCase();
    const exact = segments.find((s) => s.label === label);
    if (exact) {
      used.add(exact.label);
      return {
        questionId: q.id,
        status: 'MATCHED',
        text: exact.text,
        struckText: exact.struckText,
        segmentLabels: [exact.label],
        confidence: exact.ambiguous ? 0.6 : 1,
        ambiguous: exact.ambiguous,
      };
    }
    // The paper asks question "3" but the student answered it as 3.a, 3.b ...
    const children = segments.filter((s) => s.label.startsWith(`${label}.`));
    if (children.length > 0) {
      children.forEach((c) => used.add(c.label));
      return {
        questionId: q.id,
        status: 'COMBINED_PARTS',
        text: children.map((c) => `(${c.label}) ${c.text}`).join('\n'),
        struckText: children.map((c) => c.struckText).filter(Boolean).join('\n'),
        segmentLabels: children.map((c) => c.label),
        confidence: 0.85,
        ambiguous: children.some((c) => c.ambiguous),
      };
    }
    return { questionId: q.id, status: 'UNANSWERED', text: '', struckText: '', segmentLabels: [], confidence: 1, ambiguous: false };
  });
  return { matches, extraLabels: segments.filter((s) => !used.has(s.label)).map((s) => s.label) };
}

export interface AttemptedAlternative {
  questionId: string;
  choiceGroup: string | null;
  awarded: number;
}

/**
 * Internal choice ("answer Q3 or Q4"). Returns the alternatives that count and
 * the groups where more than one alternative was attempted, which a teacher
 * should confirm.
 */
export function resolveInternalChoice(
  attempts: AttemptedAlternative[],
  policy: 'BEST' | 'FIRST' = 'BEST',
): { counted: string[]; multipleAttempted: string[] } {
  const counted: string[] = [];
  const multipleAttempted: string[] = [];
  const groups = new Map<string, AttemptedAlternative[]>();
  for (const a of attempts) {
    if (!a.choiceGroup) {
      counted.push(a.questionId);
      continue;
    }
    groups.set(a.choiceGroup, [...(groups.get(a.choiceGroup) ?? []), a]);
  }
  for (const [group, list] of groups) {
    if (list.length > 1) multipleAttempted.push(group);
    const pick = policy === 'FIRST' ? list[0] : list.reduce((best, x) => (x.awarded > best.awarded ? x : best));
    counted.push(pick.questionId);
  }
  return { counted, multipleAttempted };
}
