import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { APRS_MAX_MESSAGE_LENGTH, TRANSPORT_DESCRIPTIONS, TRANSPORT_LABELS } from '../lib/format';
import type { SendMessageRequest, SendMessageResult, StatusSnapshot, TransportId } from '../types';

interface ComposerProps {
  activeCallsign: string;
  defaultTransport: TransportId;
  /** Transport this station was last heard on, if it has been heard at all. */
  heardOn: TransportId | null;
  status: StatusSnapshot;
  onSend: (request: SendMessageRequest) => Promise<SendMessageResult>;
}

const TRANSPORT_OPTIONS: { id: TransportId; label: string }[] = [
  { id: 'rf', label: 'RF (Direwolf)' },
  { id: 'aprsis', label: 'Internet (APRS-IS)' },
];

/**
 * A station that only ever appears on one transport is not necessarily
 * unreachable on the other, but the message then depends on a third party
 * relaying it, which is worth saying before the operator wonders why no
 * acknowledgement came back.
 */
const MISMATCH_HINTS: Record<TransportId, string> = {
  rf: 'over RF it only arrives if a station relays your transmission to the internet',
  aprsis: 'over APRS-IS it only arrives if that station is also connected to the internet',
};

/** Message input bar: 67 character limit, transport selector and ACK request. */
export function Composer({
  activeCallsign,
  defaultTransport,
  heardOn,
  status,
  onSend,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [transport, setTransport] = useState<TransportId>(defaultTransport);
  const [requestAck, setRequestAck] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTransport(defaultTransport), [defaultTransport]);
  useEffect(() => inputRef.current?.focus(), [activeCallsign]);

  const transportStatus = transport === 'rf' ? status.rf : status.aprsis;
  const transportReady = transportStatus.state === 'connected';
  const remaining = APRS_MAX_MESSAGE_LENGTH - text.length;
  const mismatched = heardOn !== null && heardOn !== transport;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim() === '' || sending) return;

    setSending(true);
    const result = await onSend({ to: activeCallsign, text, transport, requestAck });
    setSending(false);

    if (!result.ok) {
      setError(result.error ?? 'The message could not be transmitted.');
      return;
    }
    setError(null);
    setText('');
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-white/5 bg-black/25 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center gap-2 pb-2 sm:gap-3">
        <div className="join" role="group" aria-label="Transmission mode">
          {TRANSPORT_OPTIONS.map((option) => {
            const optionStatus = option.id === 'rf' ? status.rf : status.aprsis;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTransport(option.id)}
                title={TRANSPORT_DESCRIPTIONS[option.id]}
                className={clsx(
                  'btn join-item btn-xs gap-1.5',
                  transport === option.id ? 'btn-primary' : 'btn-ghost text-slate-400',
                )}
                aria-pressed={transport === option.id}
              >
                <span
                  className={clsx(
                    'size-1.5 rounded-full',
                    optionStatus.state === 'connected' ? 'bg-emerald-400' : 'bg-rose-500',
                  )}
                  aria-hidden
                />
                <span className="sm:hidden">{TRANSPORT_LABELS[option.id]}</span>
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            );
          })}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
          <input
            type="checkbox"
            className="toggle toggle-xs toggle-primary"
            checked={requestAck}
            onChange={(event) => setRequestAck(event.target.checked)}
          />
          <span className="sm:hidden">ACK</span>
          <span className="hidden sm:inline">Request ACK</span>
        </label>

        <span
          className={clsx(
            'ml-auto font-mono text-[11px]',
            remaining < 0 ? 'text-rose-400' : remaining < 12 ? 'text-amber-400' : 'text-slate-500',
          )}
        >
          {text.length}/{APRS_MAX_MESSAGE_LENGTH}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="input input-bordered input-sm w-full bg-black/30 text-sm sm:input-md"
          placeholder={`Message to ${activeCallsign}…`}
          value={text}
          maxLength={APRS_MAX_MESSAGE_LENGTH}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          aria-label="Message text"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm shrink-0 sm:btn-md"
          disabled={sending || text.trim() === ''}
          aria-label="Send message"
        >
          {sending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12l16-8-8 16-2-6-6-2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {error ? (
        <p className="pt-1.5 text-xs text-rose-400" role="alert">
          {error}
        </p>
      ) : !transportReady ? (
        <p className="pt-1.5 text-xs text-amber-400">
          The selected transport is not connected: {transportStatus.detail}
        </p>
      ) : mismatched && heardOn ? (
        <p className="flex flex-wrap items-center gap-1.5 pt-1.5 text-xs text-amber-400">
          <span>
            {activeCallsign} was last heard on{' '}
            <span className="font-semibold">{TRANSPORT_LABELS[heardOn]}</span>, so{' '}
            {MISMATCH_HINTS[transport]}.
          </span>
          <button
            type="button"
            className="btn btn-xs btn-ghost text-amber-300"
            onClick={() => setTransport(heardOn)}
          >
            Switch to {TRANSPORT_LABELS[heardOn]}
          </button>
        </p>
      ) : null}
    </form>
  );
}
