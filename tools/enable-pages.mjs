/**
 * Enables GitHub Pages for this repo through the API, so the user does not
 * have to click through Settings -> Pages in a browser.
 *
 * The token comes from whatever git already uses to push (Windows Credential
 * Manager via `git credential fill`), so there is nothing extra to configure
 * and the secret is never printed or written to disk.
 */
import { execFileSync } from 'node:child_process';

const REPO = 'yougbhgfgi-beep/Sarah-';

/* ---- token, straight from the credential git already authenticates with -- */
const credInput = 'protocol=https\nhost=github.com\n\n';
const raw = execFileSync('git', ['credential', 'fill'], { input: credInput }).toString();
const token = (raw.match(/^password=(.*)$/m) || [])[1];
if (!token) {
  console.error('no token from the git credential helper — run `git push` once first');
  process.exit(1);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

/* ---- what is there right now ---- */
const get = await api(`/repos/${REPO}/pages`);
console.log('GET  /pages  →', get.status);
if (get.status === 200) {
  console.log('  state :', get.body.status);
  console.log('  url   :', get.body.html_url);
  console.log('  build :', JSON.stringify(get.body.source ?? {}, null, 0));
  console.log('  https :', get.body.https_enforced, '| public:', get.body.public);
} else if (get.status === 404) {
  console.log('  not enabled yet — creating it');
  const post = await api(`/repos/${REPO}/pages`, {
    method: 'POST',
    body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
  });
  console.log('POST /pages  →', post.status);
  if (post.body?.message) console.log('  message:', post.body.message);
  if (post.status === 201) {
    console.log('  url    :', post.body.html_url);
    console.log('  build  :', JSON.stringify(post.body.source ?? {}));
  }
} else {
  console.log('  message:', get.body?.message);
  console.log('  docs   :', get.body?.documentation_url);
}
