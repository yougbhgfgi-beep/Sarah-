/**
 * Lists every masculine second-person PRONOUN in the content files.
 *
 * Scope note: only the pronominal suffixes are checked, not verb objects.
 * In Egyptian Arabic the 2nd-person object suffix is `-k` for BOTH genders
 * ("أقولك" is said to a woman), so flagging it would be a false positive.
 * The forms that really are marked masculine are the attached pronouns:
 * فيك/معاك/عندك/منك/بك/إليك — they become فيكي/معاكي/عندكي/منكي/بيكي/إليكي.
 *
 * Run: node tools/find-masculine.mjs [--fix]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['config.js', 'game.html', 'index.html', 'install.js'];

/* longest first so "معاكي" is not reported as "معاك" */
const PAIRS = [
  ['إليك', 'إليكي'], ['عندك', 'عندكي'], ['معاك', 'معاكي'],
  ['فيك', 'فيكي'], ['منك', 'منكي'], ['ساك', 'ساكي'],
  ['بك', 'بيكي'], ['ديك', 'ديكي'],
];

const AR = 'ء-ي';
let total = 0;

for (const file of FILES) {
  let src;
  try {
    src = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    for (const [bad, good] of PAIRS) {
      // boundaries on Arabic letters, not \b — \b is ASCII-only and would
      // never fire between two Arabic characters
      const re = new RegExp(`(?<![${AR}])${bad}(?![${AR}])`, 'g');
      if (re.test(line)) {
        total++;
        const col = line.search(re) + 1;
        console.log(`${file}:${i + 1}:${col}  ${bad} → ${good}`);
        console.log(`    ${line.trim()}`);
      }
      re.lastIndex = 0;
    }
  }
}

console.log(total === 0 ? '\nnone — every pronoun is feminine' : `\n${total} masculine pronoun(s)`);
process.exitCode = total === 0 ? 0 : 1;
