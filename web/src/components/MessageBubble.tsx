import clsx from 'clsx';

import { ACK_LABELS, TRANSPORT_LABELS, formatClock } from '../lib/format';
import type { AckState, ChatMessage } from '../types';

const ACK_STYLES: Record<AckState, string> = {
  pending: 'text-slate-300/70',
  sent: 'text-slate-100/70',
  acked: 'text-emerald-200',
  rejected: 'text-rose-200',
  failed: 'text-amber-200',
};

/** Receipt glyph: clock while queued, single check when sent, double when ACKed. */
function AckIcon({ state }: { state: AckState }) {
  if (state === 'pending') {
    return (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
    );
  }

  if (state === 'failed' || state === 'rejected') {
    return (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
        <path d="M12 9v5M12 17h.01" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 13l3.5 3.5L13 9" strokeLinecap="round" strokeLinejoin="round" />
      {state === 'acked' ? (
        <path d="M9 13l3.5 3.5L20 9" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing';
  const ackState = message.ackState;

  return (
    <div className={clsx('flex w-full', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'group max-w-[min(34rem,80%)] rounded-2xl px-3.5 py-2 shadow-lg',
          isOutgoing
            ? 'rounded-br-sm bg-gradient-to-br from-emerald-600 to-teal-600 text-emerald-50 shadow-emerald-900/30'
            : 'rounded-bl-sm bg-slate-700/70 text-slate-100 shadow-black/30 ring-1 ring-white/5',
        )}
      >
        {!isOutgoing ? (
          <p className="mb-0.5 font-mono text-[11px] font-semibold text-sky-300">{message.from}</p>
        ) : null}

        <p className="whitespace-pre-wrap break-words text-sm leading-snug">{message.text}</p>

        <div
          className={clsx(
            'mt-1 flex items-center justify-end gap-1.5 text-[10px]',
            isOutgoing ? 'text-emerald-100/70' : 'text-slate-400',
          )}
        >
          <span
            className={clsx(
              'rounded px-1 font-semibold uppercase',
              message.transport === 'rf' ? 'bg-black/20' : 'bg-amber-400/20 text-amber-100',
            )}
            title={`Received or sent via ${TRANSPORT_LABELS[message.transport]}`}
          >
            {TRANSPORT_LABELS[message.transport]}
          </span>

          {message.messageId ? (
            <span className="font-mono" title="APRS message sequence number">
              #{message.messageId}
            </span>
          ) : null}

          <time dateTime={new Date(message.timestamp).toISOString()}>
            {formatClock(message.timestamp)}
          </time>

          {isOutgoing && ackState ? (
            <span
              className={clsx('flex items-center gap-0.5', ACK_STYLES[ackState])}
              title={
                ACK_LABELS[ackState] +
                (message.attempts && message.attempts > 1 ? ` (${message.attempts} attempts)` : '')
              }
            >
              <AckIcon state={ackState} />
            </span>
          ) : null}
        </div>

        {message.raw ? (
          <p className="mt-1 hidden max-w-full truncate font-mono text-[10px] text-white/40 group-hover:block">
            {message.raw}
          </p>
        ) : null}
      </div>
    </div>
  );
}
