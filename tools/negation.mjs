/**
 * negation-aware word scanning for the Arabic copy.
 *
 * WHY THIS EXISTS
 * The site's whole tone is admiration, not a love confession, so the audits
 * fail the build on any assertive "بحبك". But the letter says it on purpose,
 * in the negative: "ولا أدّعي إني بحبك". A blunt `includes()` cannot tell
 * that apart from an actual confession, and the previous version of these
 * checks simply rejected the sentence the author wanted to keep.
 *
 * THE RULE
 * A hit is only a problem when the word is being ASSERTED. So each hit is
 * read in context: if a negator appears in the same clause, the word is
 * denied, not declared, and it is left alone.
 *
 *   "ولا أدّعي إني بحبك"                 → negated, fine
 *   "أنا بحبك من زمان"                   → asserted, fails
 *   "مش بحبك، بحترمك"                    → negated, fine
 *   "بحبك" after a full stop, no negator  → asserted, fails
 *
 * A clause is the text since the last sentence break, so a negator in an
 * earlier sentence cannot launder a confession in a later one.
 *
 * Used by both tools/verify-config.mjs and tools/audit-content.mjs so the two
 * audits can never disagree about the same sentence.
 */

/* a negation anywhere in the clause denies the clause */
const NEGATOR = /(?:^|[^\p{L}])(?:مش|م(?:ا|ش)?ش|ولا|ولا\s|ما|ما\s|لا|لم|لن|بلاش|مفيش|مقالش|من\s+غير|من\s+غير\s+ما|ماكو|ماكوش|ما得他يش|بدل\s+ما|ما\s+قد|ما\s+است|مش\s+ه|ولا\s+هو)(?![\p{L}])/u;

/* clause boundaries: a hit only inherits a negator from inside its own
   clause. scanned with a manual lastIndexOf loop rather than matchAll, so a
   plain non-global regex is all that is needed here. */
const CLAUSE_BREAK = '،؛.؟!\n\r';

const isArabicWord = (w) => /[\p{Script=Arabic}]/u.test(w);

/**
 * Find every occurrence of `word` in `text` that is NOT denied by a negator
 * in the same clause.
 *
 * @param {string} text  the copy to scan
 * @param {string} word  the exact substring to look for
 * @returns {{word: string, index: number, clause: string}[]} asserted hits
 */
export function assertedHits(text, word) {
  if (!text || !word) return [];
  const out = [];
  let from = 0;
  for (;;) {
    const i = text.indexOf(word, from);
    if (i === -1) break;
    from = i + word.length;

    /* the clause this hit lives in: back to the last break, forward to the
       next one, so a negator on either side of it counts */
    const before = text.slice(0, i);
    let start = -1;
    for (const ch of CLAUSE_BREAK) start = Math.max(start, before.lastIndexOf(ch));
    const after = text.slice(i + word.length);
    let rel = -1;
    for (const ch of CLAUSE_BREAK) {
      const at = after.indexOf(ch);
      if (at !== -1 && (rel === -1 || at < rel)) rel = at;
    }
    const clause = text.slice(start + 1, rel === -1 ? undefined : i + word.length + rel);

    /* Egyptian wraps the whole verb: "مبحبكش" denies "بحبك" by putting a م
       in front and a ش behind it, with no negator token to find. check that
       shape explicitly, or a denied confession would slip through as asserted. */
    const wrapped =
      text[i - 1] === 'م' && text[i + word.length] === 'ش';

    if (!wrapped && !NEGATOR.test(clause)) out.push({ word, index: i, clause });
  }
  return out;
}

/**
 * `text.includes(word)` but false when every hit is denied.
 * This is the drop-in replacement for the blunt checks these audits used.
 */
export function containsAsserted(text, word) {
  return assertedHits(text, word).length > 0;
}

/**
 * Scan `text` for a list of words and return the ones that are asserted.
 * @returns {{word: string, count: number, sample: string}[]}
 */
export function findAsserted(text, words) {
  const out = [];
  for (const word of words) {
    if (!isArabicWord(word)) {
      /* non-Arabic tokens (filenames, old css classes) have no negation to
         reason about, so the plain substring test is the right one */
      const count = text.split(word).length - 1;
      if (count) out.push({ word, count, sample: '' });
      continue;
    }
    const hits = assertedHits(text, word);
    if (hits.length) {
      out.push({ word, count: hits.length, sample: hits[0].clause.trim().slice(0, 60) });
    }
  }
  return out;
}
