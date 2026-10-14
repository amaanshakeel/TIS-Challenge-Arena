import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve('.');
const pages=(await readdir(root)).filter(name=>name.endsWith('.html'));
let links=0;
for(const name of pages) {
  const text=await readFile(name,'utf8');
  assert.match(text,/<!doctype html>/i,`${name}: missing doctype`);
  assert.match(text,/<html lang="en">/,`${name}: missing language`);
  assert.match(text,/name="viewport"/,`${name}: missing viewport`);
  assert.match(text,/data-site-header/,`${name}: missing header`);
  for(const match of text.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const path=match[1].split('#')[0];
    if(/^(https?:|mailto:)/.test(path))continue;
    assert.ok(!path.startsWith('/'),`${name}: root-relative path breaks repository hosting`);
    await access(resolve(root,path));links++;
  }
}
const scripts=(await readdir('js')).filter(name=>name.endsWith('.js'));
for(const name of scripts) {
  const check=spawnSync(process.execPath,['--check',`js/${name}`],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  const text=await readFile(`js/${name}`,'utf8');
  assert.doesNotMatch(text,/\.innerHTML\s*=/,`${name}: unsafe HTML rendering`);
}
const {config}=await import('../js/config.js');
assert.ok(!config.supabaseKey.startsWith('sb_secret_'),'A private secret key must never be configured');
if(config.supabaseKey.startsWith('eyJ')) {
  const payload=JSON.parse(Buffer.from(config.supabaseKey.split('.')[1],'base64url').toString());
  assert.equal(payload.role,'anon','Only a legacy anon JWT is allowed in frontend configuration');
}
console.log(`PASS ${pages.length} HTML pages, ${links} local references, ${scripts.length} JavaScript syntax checks, safe rendering and public-key configuration checks.`);
