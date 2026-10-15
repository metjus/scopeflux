import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for (const failure of ['0', '1']) test('standalone updater parses, saves and verifies catalogue APIs' + (failure === '1' ? ' while retaining a failed source' : ''), () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './tests/helpers/updater-fetch.mjs', 'scripts/refresh-catalog.mjs'], {cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 20000, env: {...process.env, DOMAINRADAR_URL: 'https://catalogue.test', DOMAINRADAR_REFRESH_TOKEN: 'fixture-token-with-no-live-access-123456', UPDATER_FIXTURE_FAILURE: failure}});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /catalogue APIs verified/);
  if (failure === '1') assert.match(result.stdout, /503.*Previous snapshot preserved/);
  assert.doesNotMatch(result.stdout, /fixture-token/);
});
