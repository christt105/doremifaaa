import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const remote = out('git', ['remote', 'get-url', 'origin']);
const sha = out('git', ['rev-parse', '--short', 'HEAD']);
const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

const repo = remote.replace(/\.git$/, '').split(/[/:]/).pop();
process.env.BASE_PATH ??= `/${repo}/`;
run('npm', ['run', 'build']);

const dir = mkdtempSync(join(tmpdir(), 'doremifaaa-pages-'));
try {
  cpSync('dist', dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');
  cpSync(join(dir, 'index.html'), join(dir, '404.html'));
  run('git', ['init', '-q', '-b', 'gh-pages'], dir);
  run('git', ['add', '-A'], dir);
  run('git', ['commit', '-q', '-m', `deploy: ${branch}@${sha}`], dir);
  run('git', ['push', '-f', remote, 'gh-pages'], dir);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
