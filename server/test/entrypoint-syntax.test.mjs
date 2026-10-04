import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the production service entrypoint parses before an image can be deployed',()=>{
  const entry=fileURLToPath(new URL('../index.mjs',import.meta.url));
  const result=spawnSync(process.execPath,['--check',entry],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
