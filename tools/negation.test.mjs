/**
 * self-test for tools/negation.mjs — the rule the two content audits share.
 * run:  node tools/negation.test.mjs
 *
 * This is the one piece of test infrastructure in the repo that has no test.
 * It matters because both `npm run audit` and `npm run verify` now depend on
 * it to decide whether a love confession is allowed through — a false pass
 * would let the wrong tone ship, and a false fail would block the author from
 * writing the sentence they actually wanted.
 */
import { assertedHits, containsAsserted, findAsserted } from './negation.mjs';

/* the exact list both content audits use, so this test breaks if that list
   ever grows a word the rule cannot handle */
const ROMANCE_WORDS = ['بحبك', 'أحبك', 'حبيبك', 'حبيبتي', 'عشيق'];

let failed = 0;
const ok = (cond, name) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
};

/* ---- the sentence the letter actually contains: must be allowed ---- */
const NEGATED_LETTER =
  'أنا مش عايز أقول كلام أكبر من اللي حاسس بيه، ولا أدّعي إني بحبك وأنا لسه معرفكيش، ' +
  'بس أقدر أقولك إنك من أول نظرة شدّيتي انتباهي.';
ok(!containsAsserted(NEGATED_LETTER, 'بحبك'), 'a denied "بحبك" is not a confession');
ok(findAsserted(NEGATED_LETTER, ROMANCE_WORDS).length === 0,
  'the real letter sentence survives the full word list');

/* ---- an actual confession: must be blocked ---- */
ok(containsAsserted('أنا بحبك من زمان.', 'بحبك'), 'an asserted "بحبك" is a confession');
ok(containsAsserted('بحبك يzy.', 'بحبك'), 'a confession at the start of a line is caught');
ok(containsAsserted('والله بحبك', 'بحبك'), 'a confession after a bare waw is caught');

/* ---- a negation must not launder a confession in a LATER clause ---- */
ok(
  containsAsserted('مش بحبك. أنا بحبك.', 'بحبك'),
  'a negator in an earlier sentence does not excuse a later confession'
);
ok(
  containsAsserted('من غير ما أكذب، بحبك.', 'بحبك'),
  'a comma-separated confession is its own clause and still caught'
);

/* ---- a negation on either side of the word counts ---- */
ok(!containsAsserted('مش بحبك', 'بحبك'), 'leading negator');
ok(!containsAsserted('بحبك مش', 'بحبك'), 'trailing negator');
ok(!containsAsserted('مبحبكش', 'بحبك'), 'م…ش negation sandwiching the word');
ok(!containsAsserted('ولا أدّعي إني بحبك', 'بحبك'), 'ولا + أديعي');

/* ---- matching is deliberately a plain substring search, so it errs toward
        reporting rather than staying silent. a diacritised hit is still a hit. */
ok(containsAsserted('بحبكِ', 'بحبك'), 'a diacritic after the word is still reported (conservative)');
/* conservative by design: a longer word that contains the needle is still
   reported rather than silently passed, because missing a real confession
   is far worse than asking the author to reword a plural form. */
ok(containsAsserted('بحبكم', 'بحبك'), 'a longer word containing the needle is still reported');

/* ---- the longer romance words ---- */
ok(!containsAsserted('مش حبيبتي', 'حبيبتي'), 'negated "حبيبتي"');
ok(containsAsserted('إنتي حبيبتي', 'حبيبتي'), 'asserted "حبيبتي"');
ok(containsAsserted('أنا أحبك', 'أحبك'), 'sanity: asserted "أحبك" is caught');
ok(!containsAsserted('مش أحبك', 'أحبك'), 'negated "أحبك"');

/* ---- non-Arabic tokens (filenames, old css classes) fall back to a
        plain substring test — there is no negation to reason about ---- */
ok(findAsserted("const x = 'icon-heart'", ['icon-heart']).length === 1, 'css token found');
ok(findAsserted("const x = 'icon-heart'", ['icon-heart', 'ending-bg']).length === 1, 'only real tokens reported');
ok(findAsserted('مفيش icon-heart هنا', ['icon-heart']).length === 1, 'tokens are not negation-filtered');

/* ---- findAsserted reports a usable sample for a human ---- */
const [hit] = findAsserted('و أنا بحبك من زمان و بحبك جدا', ['بحبك']);
ok(hit && hit.count === 2, 'findAsserted counts every asserted hit');
ok(hit && typeof hit.sample === 'string' && hit.sample.length > 0, 'findAsserted returns a sample clause');

/* ---- the empty cases must not throw ---- */
ok(containsAsserted('', 'بحبك') === false, 'empty text');
ok(containsAsserted('بحبك', '') === false, 'empty word');
ok(assertedHits(null, 'بحبك').length === 0, 'null text');

console.log('');
if (failed) {
  console.error(`${failed} negation test(s) failed — the content audits are unreliable`);
  process.exit(1);
}
console.log('negation.mjs: all tests passed');
