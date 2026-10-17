import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Inspect only files Git would publish; print paths, never matched credentials.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAIza[\w-]{30,}/, /\bsk-(?:proj-|ant-api\d\d-)?[A-Za-z0-9_-]{32,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/];
const failures = [];
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) { failures.push(file); continue; }
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size > 2000000) continue;
  if (patterns.some(pattern => pattern.test(readFileSync(file, 'utf8')))) failures.push(file);
}
if (failures.length) {
  console.error('Potential credentials in publishable files:\n' + [...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else console.log(`Credential pattern scan passed (${files.length} publishable files). This is not a complete secret audit.`);
