/**
 * Application identity on APRS networks.
 *
 * RF packets use {@link APRS_TOCALL} as the AX.25 destination (visible on aprs.fi
 * and in TNC logs). APRS-IS sessions identify via the `vers` field in the login
 * line. Beacons may carry {@link APP_DISPLAY_NAME} in the position comment.
 */

/** Human-readable name shown in the UI and beacon comments. */
export const APP_DISPLAY_NAME = 'APRS WebChat';

/** APRS-IS `vers` software id (no spaces; same convention as APRSdr16, UI-View32). */
export const APP_NAME = 'APRSWebChat';

export const APP_VERSION = '1.1.2';

/**
 * Experimental AX.25 destination ("tocall") for RF and APRS-IS third-party frames.
 * APZ*** is reserved for applications without a registered tocall.
 */
export const APRS_TOCALL = 'APZWCH';

/** Max length of an uncompressed position comment field. */
const BEACON_COMMENT_MAX = 43;

export interface ClientIdentity {
  displayName: string;
  /** APRS-IS login `vers` value, e.g. "APRSWebChat 1.1.2". */
  vers: string;
  /** AX.25 destination address on RF and IS third-party headers. */
  rfTocall: string;
  /** Short label suitable for beacon comments. */
  signature: string;
}

export function getClientIdentity(): ClientIdentity {
  return {
    displayName: APP_DISPLAY_NAME,
    vers: `${APP_NAME} ${APP_VERSION}`,
    rfTocall: APRS_TOCALL,
    signature: APP_DISPLAY_NAME,
  };
}

/** Fragment after `vers` in an APRS-IS login line. */
export function aprsIsVersField(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

/** Periodic APRS-IS comment line that keeps the session alive. */
export function aprsIsKeepaliveComment(): string {
  return `# ${APP_DISPLAY_NAME} ${APP_VERSION} keepalive`;
}

/**
 * Ensures beacons identify this client when the operator leaves the comment
 * empty, or appends the signature when there is room and it is not already present.
 */
export function beaconCommentWithSignature(userComment: string): string {
  const signature = APP_DISPLAY_NAME;
  const trimmed = userComment.trim();

  if (trimmed === '') return signature.slice(0, BEACON_COMMENT_MAX);
  if (trimmed.includes(signature)) return trimmed.slice(0, BEACON_COMMENT_MAX);

  const separator = trimmed.endsWith(' ') ? '' : ' ';
  const combined = `${trimmed}${separator}${signature}`;
  return combined.slice(0, BEACON_COMMENT_MAX);
}
