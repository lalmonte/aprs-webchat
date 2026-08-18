import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { TRANSPORT_LABELS, formatRelative } from '../lib/format';
import type { Conversation, HeardStation, StatusSnapshot, TransportId } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface SidebarProps {
  station: string;
  backendConnected: boolean;
  status: StatusSnapshot;
  conversations: Conversation[];
  heard: HeardStation[];
  activeCallsign: string | null;
  /** Below `lg`, the sidebar is an overlay drawer controlled by this flag. */
  mobileOpen: boolean;
  onMobileClose: () => void;
  onOpenConversation: (callsign: string) => void;
  onCreateConversation: (callsign: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteConversations: (
    callsigns: string[],
  ) => Promise<{ ok: boolean; error?: string; deleted?: string[] }>;
  onReconnect: (transport: TransportId) => void;
  onOpenConfig: () => void;
  onOpenAbout: () => void;
  /** Opens the backend URL screen (Android shell / remote clients). */
  onChangeServer?: () => void;
  serverUrl?: string;
  /** Quiet badge on About when a newer GitHub release exists. */
  updateAvailable?: boolean;
}

export function Sidebar({
  station,
  backendConnected,
  status,
  conversations,
  heard,
  activeCallsign,
  mobileOpen,
  onMobileClose,
  onOpenConversation,
  onCreateConversation,
  onDeleteConversations,
  onReconnect,
  onOpenConfig,
  onOpenAbout,
  onChangeServer,
  serverUrl = '',
  updateAvailable = false,
}: SidebarProps) {
  const [newCallsign, setNewCallsign] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHeard, setShowHeard] = useState(true);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chatFilter, setChatFilter] = useState('');

  const filteredConversations = useMemo(() => {
    const query = chatFilter.trim().toUpperCase();
    if (query === '') return conversations;
    return conversations.filter((conversation) => conversation.callsign.includes(query));
  }, [conversations, chatFilter]);

  // Drop selections that no longer exist (e.g. deleted elsewhere).
  useEffect(() => {
    const known = new Set(conversations.map((conversation) => conversation.callsign));
    setSelected((current) => {
      const next = new Set([...current].filter((callsign) => known.has(callsign)));
      return next.size === current.size ? current : next;
    });
  }, [conversations]);

  // Leaving manage mode clears the pending confirmation.
  useEffect(() => {
    if (!managing) {
      setConfirmingDelete(false);
      setSelected(new Set());
    }
  }, [managing]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const target = newCallsign.trim().toUpperCase();
    if (target === '') return;

    const result = await onCreateConversation(target);
    if (!result.ok) {
      setError(result.error ?? 'Unable to open the conversation.');
      return;
    }
    setError(null);
    setNewCallsign('');
  }

  function toggleSelected(callsign: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(callsign)) next.delete(callsign);
      else next.add(callsign);
      return next;
    });
    setConfirmingDelete(false);
  }

  function selectAllVisible() {
    setSelected(new Set(filteredConversations.map((conversation) => conversation.callsign)));
    setConfirmingDelete(false);
  }

  function clearSelection() {
    setSelected(new Set());
    setConfirmingDelete(false);
  }

  async function handleDeleteSelected() {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await onDeleteConversations([...selected]);
    setDeleting(false);
    setConfirmingDelete(false);

    if (!result.ok) {
      setError(result.error ?? 'Unable to delete the selected chats.');
      return;
    }

    setSelected(new Set());
    if (conversations.length <= (result.deleted?.length ?? 0)) {
      setManaging(false);
    }
  }

  // Stations already in the chat list are hidden from the "recently heard" panel.
  const knownCallsigns = new Set(conversations.map((conversation) => conversation.callsign));
  const heardOnly = heard.filter((entry) => !knownCallsigns.has(entry.callsign)).slice(0, 12);
  const allVisibleSelected =
    filteredConversations.length > 0 &&
    filteredConversations.every((conversation) => selected.has(conversation.callsign));
  const filterActive = chatFilter.trim() !== '';

  return (
    <aside
      className={clsx(
        'flex h-full flex-col gap-3 border-r border-white/5 bg-[#0b1220] p-3 shadow-2xl shadow-black/40',
        'fixed inset-y-0 left-0 z-40 w-[min(20rem,88vw)] transition-transform duration-200 ease-out',
        'lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:translate-x-0 lg:pointer-events-auto lg:shadow-none lg:bg-black/20',
        mobileOpen
          ? 'translate-x-0 pointer-events-auto'
          : '-translate-x-full pointer-events-none lg:translate-x-0',
      )}
    >
      <header className="flex items-center gap-3 px-1 pt-1">
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-emerald-400 text-slate-950 shadow-lg shadow-sky-500/20">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 21V9" strokeLinecap="round" />
            <circle cx="12" cy="6" r="2.2" />
            <path d="M7.5 13.5a6 6 0 0 1 0-8.5M16.5 5a6 6 0 0 1 0 8.5" strokeLinecap="round" />
            <path d="M9 21h6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold tracking-wide text-slate-100">APRS WebChat</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span
              className={clsx(
                'size-1.5 rounded-full',
                backendConnected ? 'bg-emerald-400' : 'bg-rose-500',
              )}
              aria-hidden
            />
            <span className="font-mono">{station}</span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square text-slate-400 lg:hidden"
          onClick={onMobileClose}
          aria-label="Close navigation"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <section className="flex flex-col gap-2" aria-label="Connection status">
        <StatusIndicator name="Direwolf (KISS TCP)" status={status.rf} onReconnect={() => onReconnect('rf')} />
        <StatusIndicator name="APRS-IS" status={status.aprsis} onReconnect={() => onReconnect('aprsis')} />
      </section>

      <form onSubmit={handleCreate} className="flex flex-col gap-1">
        <div className="join w-full">
          <input
            className="input input-sm join-item w-full bg-black/30 font-mono uppercase placeholder:font-sans placeholder:normal-case"
            placeholder="New chat: callsign-SSID"
            value={newCallsign}
            maxLength={9}
            onChange={(event) => setNewCallsign(event.target.value.toUpperCase())}
            aria-label="Callsign of the station to chat with"
            disabled={managing}
          />
          <button
            type="submit"
            className="btn btn-sm join-item btn-primary"
            aria-label="Start chat"
            disabled={managing}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {error ? <p className="px-1 text-[11px] text-rose-400">{error}</p> : null}
      </form>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <section>
          <div className="flex items-center gap-2 px-1 pb-1">
            <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Active Chats
            </h2>
            {conversations.length > 0 ? (
              <button
                type="button"
                className={clsx(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                  managing
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
                )}
                onClick={() => setManaging((current) => !current)}
                aria-pressed={managing}
              >
                {managing ? 'Done' : 'Manage'}
              </button>
            ) : null}
          </div>

          {conversations.length > 0 ? (
            <div className="relative mb-2 px-1">
              <input
                type="search"
                className="input input-xs w-full bg-black/30 pr-7 font-mono uppercase placeholder:font-sans placeholder:normal-case"
                placeholder="Search callsign…"
                value={chatFilter}
                maxLength={9}
                onChange={(event) => setChatFilter(event.target.value.toUpperCase())}
                aria-label="Filter active chats by callsign"
              />
              {filterActive ? (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
                  onClick={() => setChatFilter('')}
                  aria-label="Clear callsign filter"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}

          {managing && conversations.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
              <button
                type="button"
                className="btn btn-ghost btn-xs text-slate-400"
                onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                disabled={filteredConversations.length === 0}
              >
                {allVisibleSelected ? 'Clear' : filterActive ? 'Select visible' : 'Select all'}
              </button>
              <span className="font-mono text-[10px] text-slate-500">
                {selected.size}/{conversations.length}
              </span>
              {confirmingDelete ? (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-error btn-xs"
                    onClick={() => void handleDeleteSelected()}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : `Delete ${selected.size}`}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs ml-auto text-rose-300 hover:bg-rose-500/10"
                  disabled={selected.size === 0}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete selected
                </button>
              )}
            </div>
          ) : null}

          {conversations.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-500">
              No conversations yet. Enter a callsign above to start one.
            </p>
          ) : filteredConversations.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-500">
              No chats match <span className="font-mono text-slate-400">{chatFilter.trim()}</span>.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filteredConversations.map((conversation) => {
                const isSelected = selected.has(conversation.callsign);
                return (
                  <li key={conversation.callsign}>
                    {managing ? (
                      <label
                        className={clsx(
                          'flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors',
                          isSelected
                            ? 'bg-rose-500/10 ring-1 ring-rose-400/30'
                            : 'hover:bg-white/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs mt-0.5 checkbox-error"
                          checked={isSelected}
                          onChange={() => toggleSelected(conversation.callsign)}
                          aria-label={`Select ${conversation.callsign}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="flex-1 truncate font-mono text-sm font-semibold text-slate-100">
                              {conversation.callsign}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {formatRelative(conversation.lastActivity)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {conversation.lastMessage || 'No messages exchanged yet'}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenConversation(conversation.callsign)}
                        className={clsx(
                          'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                          conversation.callsign === activeCallsign
                            ? 'bg-sky-500/15 ring-1 ring-sky-400/40'
                            : 'hover:bg-white/5',
                        )}
                        aria-current={conversation.callsign === activeCallsign}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="flex-1 truncate font-mono text-sm font-semibold text-slate-100">
                            {conversation.callsign}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {formatRelative(conversation.lastActivity)}
                          </span>
                          {conversation.unread > 0 ? (
                            <span className="badge badge-xs badge-primary font-semibold">
                              {conversation.unread}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-slate-400">
                          {conversation.lastMessage || 'No messages exchanged yet'}
                        </p>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <button
            type="button"
            className="flex w-full items-center gap-1 px-1 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300"
            onClick={() => setShowHeard((current) => !current)}
            aria-expanded={showHeard}
          >
            <svg
              viewBox="0 0 24 24"
              className={clsx('size-3 transition-transform', showHeard && 'rotate-90')}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Recently Heard
            <span className="ml-auto font-mono normal-case tracking-normal">{heardOnly.length}</span>
          </button>
          {showHeard ? (
            heardOnly.length === 0 ? (
              <p className="px-1 py-1 text-xs text-slate-500">No new stations heard.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {heardOnly.map((entry) => (
                  <li key={entry.callsign}>
                    <button
                      type="button"
                      onClick={() => onCreateConversation(entry.callsign)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-white/5"
                      title={`${entry.dataType} via ${TRANSPORT_LABELS[entry.transport]}`}
                      disabled={managing}
                    >
                      <span className="flex-1 truncate font-mono text-xs text-slate-300">
                        {entry.callsign}
                      </span>
                      <span
                        className={clsx(
                          'rounded px-1 text-[10px] font-semibold',
                          entry.transport === 'rf'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300',
                        )}
                      >
                        {TRANSPORT_LABELS[entry.transport]}
                      </span>
                      <span className="w-8 text-right text-[10px] text-slate-500">
                        {formatRelative(entry.lastHeard)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      </div>

      <div className="flex flex-col gap-1.5">
        {onChangeServer ? (
          <button
            type="button"
            className="btn btn-sm btn-block btn-ghost justify-start gap-2 text-slate-400"
            onClick={onChangeServer}
            title={serverUrl || 'Same origin'}
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-left">
              {serverUrl ? `Server: ${serverUrl.replace(/^https?:\/\//, '')}` : 'Change backend server'}
            </span>
          </button>
        ) : null}
        <button type="button" className="btn btn-sm btn-block btn-neutral" onClick={onOpenConfig}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15H2.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 12h.1a2 2 0 1 1 0 4h-.1Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Configuration
        </button>
        <button type="button" className="btn btn-sm btn-block btn-ghost text-slate-400" onClick={onOpenAbout}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 10v6M12 7.5v.5" strokeLinecap="round" />
          </svg>
          About
          {updateAvailable ? (
            <span className="ml-auto rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
              Update
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}
