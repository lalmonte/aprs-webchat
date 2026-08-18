import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { TRANSPORT_LABELS, formatAge } from '../lib/format';
import type {
  ChatMessage,
  Conversation,
  SendMessageRequest,
  SendMessageResult,
  StatusSnapshot,
  TransportId,
} from '../types';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  station: string;
  activeCallsign: string | null;
  conversation: Conversation | null;
  messages: ChatMessage[];
  status: StatusSnapshot;
  defaultTransport: TransportId;
  onSend: (request: SendMessageRequest) => Promise<SendMessageResult>;
  onDelete: (callsign: string) => Promise<{ ok: boolean; error?: string }>;
  /** Opens the chat list drawer on small screens. */
  onOpenSidebar?: () => void;
}

export function ChatWindow({
  station,
  activeCallsign,
  conversation,
  messages,
  status,
  defaultTransport,
  onSend,
  onDelete,
  onOpenSidebar,
}: ChatWindowProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Follow new traffic unless the operator has scrolled up to read history.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || !pinnedToBottom.current) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  // Never carry a pending confirmation over to another station.
  useEffect(() => setConfirmingDelete(false), [activeCallsign]);

  if (!activeCallsign) {
    return (
      <section className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="panel max-w-md rounded-2xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-sky-500/15 text-sky-300">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">No conversation selected</h2>
          <p className="mt-2 text-sm text-slate-400">
            Pick a station from the sidebar or type a callsign to start a new APRS conversation.
            Messages received while you are away will appear automatically.
          </p>
          {onOpenSidebar ? (
            <button
              type="button"
              className="btn btn-primary btn-sm mt-4 lg:hidden"
              onClick={onOpenSidebar}
            >
              Open chats
            </button>
          ) : null}
          <p className="mt-4 font-mono text-xs text-slate-500">Operating as {station}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-black/25 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-500/15 font-mono text-xs font-bold text-sky-300">
          {activeCallsign.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm text-slate-400">
            <span className="hidden sm:inline">Chatting with: </span>
            <span className="font-mono text-base font-bold text-slate-100">{activeCallsign}</span>
          </h2>
          <p className="truncate text-[11px] text-slate-500">
            {conversation?.heardOn ? (
              <>
                Last heard on{' '}
                <span
                  className={clsx(
                    'font-semibold',
                    conversation.heardOn === 'rf' ? 'text-emerald-300' : 'text-amber-300',
                  )}
                >
                  {TRANSPORT_LABELS[conversation.heardOn]}
                </span>{' '}
                · {formatAge(conversation.lastActivity)}
              </>
            ) : (
              'Not heard yet — the station may be out of range.'
            )}
          </p>
        </div>
        {confirmingDelete ? (
          <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
            <span className="hidden text-xs text-slate-300 sm:inline">Delete?</span>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-xs btn-error"
              onClick={() => {
                setConfirmingDelete(false);
                void onDelete(activeCallsign);
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <>
            <span className="badge badge-sm badge-ghost hidden font-mono sm:inline-flex">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle text-slate-400 hover:text-rose-300"
              onClick={() => setConfirmingDelete(true)}
              title="Delete this conversation and its history"
              aria-label="Delete conversation"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v6M14 11v6" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
      </header>

      <div
        ref={threadRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinnedToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
      >
        {messages.length === 0 ? (
          <p className="m-auto max-w-sm text-center text-sm text-slate-500">
            No messages with {activeCallsign} yet. APRS messages are limited to 67 characters, so
            keep it short — like a good CW operator.
          </p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <Composer
        activeCallsign={activeCallsign}
        defaultTransport={defaultTransport}
        heardOn={conversation?.heardOn ?? null}
        status={status}
        onSend={onSend}
      />
    </section>
  );
}
