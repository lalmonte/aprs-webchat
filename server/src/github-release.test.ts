import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareSemver, isNewerRelease, updateFromGithubRelease } from './github-release.js';

test('semver comparison treats a missing v prefix as the same version', () => {
  assert.equal(compareSemver('v1.1.0', '1.1.0'), 0);
  assert.equal(isNewerRelease('1.1.0', '1.1.0'), false);
});

test('a higher minor is newer than the running build', () => {
  assert.equal(isNewerRelease('1.2.0', '1.1.0'), true);
  assert.equal(isNewerRelease('1.1.0', '1.2.0'), false);
  assert.equal(isNewerRelease('2.0.0', '1.9.9'), true);
});

test('a GitHub latest payload becomes an update only when the tag is newer', () => {
  const payload = {
    tag_name: 'v1.2.0',
    html_url: 'https://github.com/lalmonte/aprs-webchat/releases/tag/v1.2.0',
    name: 'APRS WebChat v1.2.0',
    published_at: '2026-08-18T00:00:00Z',
    draft: false,
    prerelease: false,
  };
  const update = updateFromGithubRelease(payload, '1.1.0');
  assert.deepEqual(update, {
    currentVersion: '1.1.0',
    latestVersion: '1.2.0',
    releaseUrl: payload.html_url,
    releaseName: payload.name,
    publishedAt: payload.published_at,
  });
  assert.equal(updateFromGithubRelease(payload, '1.2.0'), null);
  assert.equal(updateFromGithubRelease({ ...payload, prerelease: true }, '1.1.0'), null);
});
