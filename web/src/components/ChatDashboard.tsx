import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { useAprsChat } from '../hooks/useAprsChat';
import { AboutModal } from './AboutModal';
import { BulletinsView } from './BulletinsView';
import { ChatWindow } from './ChatWindow';
import { ConfigModal } from './ConfigModal';
import { LogConsole } from './LogConsole';
import { MapView } from './MapView';
import { Sidebar } from './Sidebar';
import { TelemetryView } from './TelemetryView';
import { UpdateBanner } from './UpdateBanner';
import { WeatherView } from './WeatherView';

type View = 'chat' | 'map' | 'weather' | 'telemetry' | 'bulletins';

const VIEW_LABELS: Record<View, string> = {
  chat: 'Chat',
  map: 'Map',
  weather: 'Weather',
  telemetry: 'Telemetry',
  bulletins: 'Bulletins',
};

const LG_QUERY = '(min-width: 1024px)';

/**
 * Full dashboard layout: station sidebar, chat thread and the real-time log
 * console. All live state comes from the single `useAprsChat` socket session.
 * Below the `lg` breakpoint the sidebar becomes an overlay drawer.
 */
export function ChatDashboard({
  serverUrl = '',
  onChangeServer,
}: {
  serverUrl?: string;
  onChangeServer?: () => void;
}) {
  const chat = useAprsChat(serverUrl);
  const [configOpen, setConfigOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keep the drawer closed when rotating into a desktop layout.
  useEffect(() => {
    const media = window.matchMedia(LG_QUERY);
    const sync = () => {
      if (media.matches) setSidebarOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const openChatWith = (callsign: string) => {
    void chat.createConversation(callsign);
    setView('chat');
    setSidebarOpen(false);
  };

  const openConversation = (callsign: string) => {
    chat.openConversation(callsign);
    setView('chat');
    setSidebarOpen(false);
  };

  const createConversation = async (callsign: string) => {
    const result = await chat.createConversation(callsign);
    if (result.ok) {
      setView('chat');
      setSidebarOpen(false);
    }
    return result;
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {!chat.backendConnected ? (
        <div className="flex flex-col gap-2 bg-rose-500/15 px-3 py-2 text-xs text-rose-100 sm:px-4">
          <div className="flex items-start gap-2">
            <span className="loading loading-spinner loading-xs mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-rose-100">Lost connection to the backend</p>
              <p className="mt-0.5 break-words text-rose-200/90">
                {chat.connectionError ??
                  (serverUrl
                    ? `Trying ${serverUrl}…`
                    : 'Waiting for the backend…')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-xs btn-error"
              onClick={() => chat.reconnectBackend()}
            >
              Retry
            </button>
            {onChangeServer ? (
              <button type="button" className="btn btn-xs btn-ghost text-rose-100" onClick={onChangeServer}>
                Change server URL
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-xs btn-ghost text-rose-100"
              onClick={() => setConfigOpen(true)}
            >
              Configuration
            </button>
          </div>
        </div>
      ) : null}

      <UpdateBanner update={chat.update} />
      <div className="relative flex min-h-0 flex-1">
        {/* Scrim behind the mobile sidebar drawer. */}
        <button
          type="button"
          className={clsx(
            'fixed inset-0 z-30 bg-black/60 transition-opacity lg:hidden',
            sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-label="Close navigation"
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar
          station={chat.station}
          backendConnected={chat.backendConnected}
          status={chat.status}
          conversations={chat.conversations}
          heard={chat.heard}
          activeCallsign={chat.activeCallsign}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          onOpenConversation={openConversation}
          onCreateConversation={createConversation}
          onDeleteConversations={chat.deleteConversations}
          onReconnect={chat.reconnect}
          onOpenConfig={() => {
            setSidebarOpen(false);
            setConfigOpen(true);
          }}
          onOpenAbout={() => {
            setSidebarOpen(false);
            setAboutOpen(true);
          }}
          onChangeServer={
            onChangeServer
              ? () => {
                  setSidebarOpen(false);
                  onChangeServer();
                }
              : undefined
          }
          serverUrl={serverUrl}
          updateAvailable={Boolean(chat.update)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex shrink-0 items-center gap-1 border-b border-white/5 bg-black/20 px-2 py-1.5 sm:px-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square shrink-0 text-slate-300 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chats and status"
              aria-expanded={sidebarOpen}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {(['chat', 'map', 'weather', 'telemetry', 'bulletins'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={clsx(
                    'shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3',
                    view === id
                      ? 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                  )}
                  aria-current={view === id}
                >
                  {VIEW_LABELS[id]}
                </button>
              ))}
              {view === 'map' && chat.positions.length > 0 ? (
                <span className="ml-1 hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">
                  {chat.positions.length} position{chat.positions.length === 1 ? '' : 's'}
                </span>
              ) : null}
              {view === 'weather' && chat.weather.length > 0 ? (
                <span className="ml-1 hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">
                  {chat.weather.length} station{chat.weather.length === 1 ? '' : 's'}
                </span>
              ) : null}
              {view === 'telemetry' && chat.telemetry.length > 0 ? (
                <span className="ml-1 hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">
                  {chat.telemetry.length} station{chat.telemetry.length === 1 ? '' : 's'}
                </span>
              ) : null}
              {view === 'bulletins' && chat.bulletins.length > 0 ? (
                <span className="ml-1 hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">
                  {chat.bulletins.length} line{chat.bulletins.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square shrink-0 text-slate-300 lg:hidden"
              onClick={() => setConfigOpen(true)}
              aria-label="Open configuration"
              title="Configuration"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15H2.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 12h.1a2 2 0 1 1 0 4h-.1Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <span className="hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline lg:hidden">
              {chat.station}
            </span>
          </nav>

          {view === 'chat' ? (
            <ChatWindow
              station={chat.station}
              activeCallsign={chat.activeCallsign}
              conversation={chat.activeConversation}
              messages={chat.activeMessages}
              status={chat.status}
              defaultTransport={chat.config?.defaultTransport ?? 'rf'}
              onSend={chat.sendMessage}
              onDelete={chat.deleteConversation}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          ) : null}
          {view === 'map' ? (
            <MapView
              positions={chat.positions}
              weather={chat.weather}
              station={chat.station}
              onSelectStation={openChatWith}
              onClearPositions={chat.clearMapPositions}
            />
          ) : null}
          {view === 'weather' ? (
            <WeatherView
              weather={chat.weather}
              station={chat.station}
              onSelectStation={openChatWith}
            />
          ) : null}
          {view === 'telemetry' ? (
            <TelemetryView
              telemetry={chat.telemetry}
              station={chat.station}
              onSelectStation={openChatWith}
            />
          ) : null}
          {view === 'bulletins' ? (
            <BulletinsView
              bulletins={chat.bulletins}
              station={chat.station}
              onSelectStation={openChatWith}
            />
          ) : null}

          <LogConsole logs={chat.logs} onClear={chat.clearLogs} />
        </main>
      </div>

      <ConfigModal
        open={configOpen}
        config={chat.config}
        clientIdentity={chat.clientIdentity}
        onClose={() => setConfigOpen(false)}
        onSave={chat.updateConfig}
      />
      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        appVersion={chat.appVersion}
        clientIdentity={chat.clientIdentity}
        update={chat.update}
      />
    </div>
  );
}
