import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APP_DISPLAY_NAME,
  aprsIsKeepaliveComment,
  aprsIsVersField,
  beaconCommentWithSignature,
  getClientIdentity,
} from './client-identity.js';

describe('client identity', () => {
  it('exposes network identifiers', () => {
    const id = getClientIdentity();
    assert.equal(id.displayName, APP_DISPLAY_NAME);
    assert.match(id.vers, /^APRSWebChat \d+\.\d+\.\d+$/);
    assert.equal(id.rfTocall, 'APZWCH');
    assert.equal(id.signature, APP_DISPLAY_NAME);
  });

  it('formats APRS-IS vers and keepalive', () => {
    assert.match(aprsIsVersField(), /^APRSWebChat \d+\.\d+\.\d+$/);
    assert.match(aprsIsKeepaliveComment(), /^# APRS WebChat \d+\.\d+\.\d+ keepalive$/);
  });

  it('uses the app name when the beacon comment is empty', () => {
    assert.equal(beaconCommentWithSignature(''), APP_DISPLAY_NAME);
    assert.equal(beaconCommentWithSignature('   '), APP_DISPLAY_NAME);
  });

  it('appends the signature when it fits', () => {
    assert.equal(beaconCommentWithSignature('QTH Santiago'), 'QTH Santiago APRS WebChat');
  });

  it('does not duplicate the signature', () => {
    assert.equal(beaconCommentWithSignature('Running APRS WebChat'), 'Running APRS WebChat');
  });

  it('truncates to 43 characters', () => {
    const long = 'A'.repeat(40);
    assert.equal(beaconCommentWithSignature(long).length, 43);
  });
});
