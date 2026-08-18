import { useState } from 'react';

import { ChatDashboard } from './components/ChatDashboard';
import { ServerSetup } from './components/ServerSetup';
import { isNativeShell, loadServerUrl, saveServerUrl } from './lib/serverUrl';

export default function App() {
  const [serverUrl, setServerUrl] = useState(() => loadServerUrl());
  const [editingServer, setEditingServer] = useState(false);

  const mustConfigure = isNativeShell() && serverUrl === '';

  if (mustConfigure || editingServer) {
    return (
      <ServerSetup
        initialUrl={serverUrl}
        allowSkip={!isNativeShell()}
        onCancel={editingServer && serverUrl !== '' ? () => setEditingServer(false) : undefined}
        onSave={(url) => {
          saveServerUrl(url);
          setServerUrl(url);
          setEditingServer(false);
        }}
      />
    );
  }

  return (
    <ChatDashboard
      key={serverUrl || 'same-origin'}
      serverUrl={serverUrl}
      onChangeServer={() => setEditingServer(true)}
    />
  );
}
