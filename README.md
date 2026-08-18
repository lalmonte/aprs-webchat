# APRS WebChat

[![CI](https://github.com/lalmonte/aprs-webchat/actions/workflows/ci.yml/badge.svg)](https://github.com/lalmonte/aprs-webchat/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/lalmonte/aprs-webchat)](https://github.com/lalmonte/aprs-webchat/releases/latest)
[![Licence](https://img.shields.io/github/license/lalmonte/aprs-webchat)](LICENSE)

A station-side APRS messaging dashboard. It talks to a local
[Direwolf](https://github.com/wb2osz/direwolf) TNC over **KISS TCP** and to the
**APRS-IS** internet backbone, so you can send and receive messages over the
air, over the internet, or both.

This is **not** a hosted website like aprs.fi. You run it on *your* computer or
Raspberry Pi, with *your* callsign. Other amateurs use their own copy.

**Developed by Luis Almonte, [HI3LAG](https://www.qrz.com/db/HI3LAG)** (Dominican Republic).

> **Licensing.** Transmitting APRS requires a valid amateur radio licence. Use
> passcode `-1` to stay receive-only on APRS-IS.

## Download (no Node.js required)

Grab the binary for your operating system from the
**[latest GitHub Release](https://github.com/lalmonte/aprs-webchat/releases/latest)**.

| File | Platform |
| --- | --- |
| [`aprs-webchat-win-x64.exe`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-win-x64.exe) | Windows 64-bit |
| [`aprs-webchat-linux-x64`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-linux-x64) | Linux x86_64 |
| [`aprs-webchat-linux-arm64`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-linux-arm64) | Linux ARM64 |
| [`aprs-webchat-raspberry-pi-arm64`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-raspberry-pi-arm64) | Raspberry Pi (64-bit OS) |
| [`aprs-webchat-macos-x64`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-macos-x64) | macOS Intel |
| [`aprs-webchat-macos-arm64`](https://github.com/lalmonte/aprs-webchat/releases/latest/download/aprs-webchat-macos-arm64) | macOS Apple Silicon |

Android is **not** in the releases yet. The phone UI talks to this backend; a
public APK will follow when it is ready. SHA-256 checksums are in `SHA256SUMS`
on each release.

### Run the binary

1. Download the file for your platform (see the table above).
2. On Linux / macOS / Raspberry Pi: `chmod +x` the file, then run it.
3. On Windows: double-click the `.exe`.
4. The program starts a local server and opens the dashboard in your browser
   (default [http://127.0.0.1:3001](http://127.0.0.1:3001)).
5. Open **Configuration**, set your callsign, SSID and (optional) APRS-IS
   passcode. Point RF at Direwolf's KISS port if you have a radio.

Configuration and chat history are stored in a `data/` folder next to the
executable. Direwolf still runs as a separate program.

Optional environment variables: `PORT`, `HOST` (use `0.0.0.0` to open the
dashboard from other devices on the LAN), `APRS_OPEN_BROWSER=0`, `APRS_DATA_DIR`.

> **macOS.** GitHub builds are **ad-hoc signed** so Apple Silicon will run them
> (`chmod +x` is not enough on an unsigned download — macOS kills it). The first
> launch from Safari/Chrome may still need a right-click → **Open** because of
> quarantine. If the shell says `killed`, run:
> `xattr -d com.apple.quarantine ./aprs-webchat-macos-arm64`.
> **Windows** SmartScreen may warn. Compare the file against `SHA256SUMS` if you
> want to verify the download.

**Raspberry Pi:** use `aprs-webchat-raspberry-pi-arm64` on a **64-bit** Raspberry
Pi OS (Pi 3 / 4 / 5 / Zero 2 W). Check with `uname -m` — it should print
`aarch64`. 32-bit Raspberry Pi OS (`armv7l`) is not supported.

```bash
chmod +x aprs-webchat-raspberry-pi-arm64
HOST=0.0.0.0 ./aprs-webchat-raspberry-pi-arm64
```

Then browse to `http://<pi-hostname>:3001` from another device on the LAN.

## What it does

```
┌──────────────┬─────────────────────────────────────────────┐
│  Sidebar     │  Chatting with: K6KJZ-9                     │
│  · Status    │  ┌────────────────────────────────────────┐ │
│  · Chats     │  │  message thread (sent / received)      │ │
│  · Heard     │  └────────────────────────────────────────┘ │
│  · Config    │  [RF | APRS-IS]  message …            Send  │
├──────────────┴─────────────────────────────────────────────┤
│  System Logs — RF Tx / RF Rx / APRS-IS / Errors            │
└────────────────────────────────────────────────────────────┘
```

- **Dual transport.** Each message can go out over the radio (KISS frames to
  Direwolf) or through APRS-IS, chosen per message.
- **Real AX.25 / KISS.** Frames are built and parsed from raw buffers:
  bit-shifted address fields, digipeater paths with the H bit, KISS escaping,
  and reassembly across TCP chunks.
- **Acknowledgements.** Outgoing messages can request an ACK, retransmit on a
  rising schedule (15 / 25 / 40 / 60 s) and show a receipt marker. Classic
  `ackNN` and APRS 1.2 reply-ack are both understood. Incoming ACK requests are
  answered automatically on the transport they arrived on.
- **Live map.** Position reports are plotted: uncompressed, compressed base91,
  Mic-E, and objects/items, plus course, speed and altitude. Markers use the
  official APRS symbol sprites. Click a station to start a chat. **Clear map**
  drops stored positions until the next report arrives.
- **Weather.** Temperature, wind, gust, rain, humidity and pressure from
  position-attached `_` weather, positionless `_` reports and Peet `*` packets.
- **Telemetry.** `T#…` samples as sparklines; `PARM` / `UNIT` / `EQNS` / `BITS`
  label channels and apply scaling.
- **Bulletins.** Network bulletins and group announcements addressed to `BLN…`
  on a dedicated tab (not mixed into 1:1 chat).
- **History.** Conversations, messages, ACK state and last-known positions
  survive a restart.
- **Position beacon.** Optional scheduled beacon of your station over RF or
  APRS-IS, from the Settings modal.
- **Log console.** Raw TNC2 lines, colour-coded (RF Tx / RF Rx / APRS-IS /
  errors), filterable.
- **Update notice.** The backend checks GitHub for a newer tagged release and
  the dashboard shows a banner with a download link (can be dismissed per
  version, or disabled with `APRS_UPDATE_CHECK=0`).
- **Resilient connectors.** Backoff reconnect, APRS-IS keepalives, receive
  watchdog. A packet heard on RF and again on APRS-IS is shown once.

## Requirements

For a **binary** install you only need:

- Windows, Linux, macOS or 64-bit Raspberry Pi OS
- Direwolf with a KISS TCP port, if you want RF
- An APRS-IS passcode for your callsign, if you want to *transmit* on the
  internet (`-1` is receive-only)

To run or build **from source** you also need **Node.js 20 or newer**.

## Run from source

```bash
git clone https://github.com/lalmonte/aprs-webchat.git
cd aprs-webchat
npm install
cp .env.example .env      # set at least APRS_CALLSIGN, APRS_SSID, APRS_PASSCODE
npm run dev               # backend on :3001, dashboard on :5173
```

Open <http://localhost:5173>. Callsign, passcode, Direwolf, APRS-IS server and
filter can all be edited from **Configuration** at runtime. Changes are saved to
`server/data/config.json` and the affected connector reconnects immediately.

### Production (single port)

```bash
npm run build
npm start                 # API + UI on :3001
```

When `web/dist` exists the backend serves it, so the whole app uses one port.

### No radio at hand?

A mock TNC speaks the same KISS protocol as Direwolf, beacons fake stations and
answers any message sent to `MOCK-1`:

```bash
npm run mock:tnc          # terminal 1 — listens on 127.0.0.1:8001
npm run dev               # terminal 2
```

Start a chat with `MOCK-1` and you will see the transmitted frame, the ACK and a
reply in the log console.

## Direwolf configuration

Add a KISS TCP port to `direwolf.conf` (this is the default port):

```
ACHANNELS 1
CHANNEL 0
MYCALL N0CALL-10
MODEM 1200
KISSPORT 8001
```

Point the dashboard at `127.0.0.1:8001`. Direwolf exposes each radio channel as
a KISS port on that socket; pick the transmit channel in Configuration.

> **The transmit channel must exist.** A single-radio Direwolf only has channel
> 0. If you point the app at a channel Direwolf does not have, it discards every
> frame and reports `Invalid transmit channel N from KISS client app` on its own
> console — the KISS client is never told, so the dashboard would happily show
> the packet as transmitted. On connect the app therefore asks Direwolf's AGWPE
> port (8000 by default, override with `DIREWOLF_AGW_PORT`) how many channels it
> has and raises a red error when the configured channel is out of range.

## Troubleshooting

**Messages appear as sent but never reach the air.** Almost always the transmit
channel above. Check the log console for the channel it used (`RF ch0 TX`) and
the warning raised on connect.

**Messages are transmitted but nobody ever acknowledges.** Look for `RF ch0 RX`
lines in the log. If there are none at all nothing is coming back over the air.
Direwolf prints every packet it decodes on its own console, so compare the two:
packets shown there but not here point at the KISS session. Nothing on either
means the receive audio is not reaching Direwolf, or that nothing within range
is transmitting.

That last case is common and easy to mistake for a fault. Most igates are
receive-only, and gating messages from APRS-IS back to RF is the exception
rather than the rule. Check what is actually near you on <https://aprs.fi>:
your own packets there carry a `qAR,CALLSIGN` construct naming the igate that
heard them.

**Acknowledgements only arrive while APRS-IS is connected.** Read the path of
the incoming ACK. `TCPIP*` together with a `qAC` construct means the other
station injected the packet straight into APRS-IS and it never touched a radio,
so with APRS-IS disconnected there is no route for it to reach you. Phone
clients such as APRSdroid (tocall `APDR__`) run this way by default.

When a Tx-capable igate does gate that traffic onto RF, the packet arrives as
third-party traffic (data type `}`):
`HI4R>…:}HI3LAG-5>APDR16,TCPIP,HI4R*::YOU:Hello{13`. The enclosed station is
treated as the peer for chat and acknowledgements.

**Direwolf is running but the KISS port never answers.** Direwolf serves a small
fixed number of KISS clients and only accepts a new one when a slot frees up. A
client that dies abruptly can leave its slot occupied. Restart Direwolf to
release the slots. Stopping this app with Ctrl-C closes the session cleanly.

**Nothing is logged in the terminal.** The backend mirrors every log line to
stdout. If the terminal is silent the process is not running.

## Configuration reference

| Field | Environment variable | Default | Notes |
| --- | --- | --- | --- |
| Callsign | `APRS_CALLSIGN` | `N0CALL` | Base callsign, no SSID |
| SSID | `APRS_SSID` | `10` | 0–15 |
| Passcode | `APRS_PASSCODE` | `-1` | `-1` is receive-only |
| Direwolf host / port | `DIREWOLF_HOST` / `DIREWOLF_PORT` | `127.0.0.1:8001` | KISS TCP |
| Direwolf channel | `DIREWOLF_CHANNEL` | `0` | Must exist on the TNC |
| Direwolf AGWPE port | `DIREWOLF_AGW_PORT` | `8000` | Only used to validate the channel |
| Digipeater path | `APRS_PATH` | `WIDE1-1,WIDE2-1` | Max 8 hops |
| APRS-IS host / port | `APRSIS_HOST` / `APRSIS_PORT` | `rotate.aprs2.net:14580` | 14580 accepts filters |
| APRS-IS filter | `APRSIS_FILTER` | `m/100` | Appended to the login line |
| Default transport | `APRS_DEFAULT_TRANSPORT` | `rf` | `rf` or `aprsis` |
| Auto-ACK | `APRS_AUTO_ACK` | `true` | Answer incoming ACK requests |
| HTTP port / host | `PORT` / `HOST` | `3001` / `0.0.0.0` | |
| Config file | `APRS_CONFIG_PATH` | `server/data/config.json` | Contains the passcode |
| History file | `APRS_HISTORY_PATH` | `server/data/history.json` | Chats and positions |
| Beacon | `APRS_BEACON_*` | disabled | Interval, lat/lon, comment, symbol, transport |
| GitHub update check | `APRS_UPDATE_CHECK` | `true` | Set `0` to disable the release banner |
| GitHub repo | `APRS_GITHUB_REPO` | `lalmonte/aprs-webchat` | `owner/name` for `/releases/latest` |

These values only seed the first boot. Afterwards the UI writes
`server/data/config.json` (or `data/config.json` next to a packaged binary).

## Architecture

```
web/  React + Vite + Tailwind/daisyUI          server/  Node + Fastify + Socket.io
├── components/ChatDashboard.tsx  layout       ├── server.ts            hub: sockets, routing, retries
├── components/Sidebar.tsx        status/chats ├── config.ts             validated + persisted settings
├── components/ChatWindow.tsx     thread       ├── store.ts              messages, conversations, positions
├── components/MapView.tsx        station map  ├── persistence.ts        debounced atomic history file
├── components/Composer.tsx       input bar    ├── connectors/base.ts    TCP lifecycle + backoff
├── components/LogConsole.tsx     raw frames   ├── connectors/direwolf.ts KISS TCP client
└── hooks/useAprsChat.ts          socket state ├── connectors/aprsis.ts   APRS-IS client
                                              └── protocol/  kiss.ts · ax25.ts · aprs.ts · position.ts
```

The backend is the single source of truth. It keeps the TCP sessions, parses and
builds frames, tracks acknowledgement state and pushes everything to the browser
over Socket.io.

### History on disk

Messages, conversations and the last known position of each station are written
to `history.json` and reloaded at boot. Writes are debounced by two seconds and
atomic (write then rename). Delete the file to start from scratch.

### Positions

Every received packet is offered to the position decoder: uncompressed
(`!4903.50N/07201.75W-`), compressed base91 (`!/5L!!<*e7>`), Mic-E (latitude
hidden in the AX.25 destination address) and objects/items. Implausible
coordinates and the `0,0` placeholder are discarded. A later report from the
same station **replaces** the marker on the map.

### APRS-IS login

```
user N0CALL-10 pass 12345 vers APRSWebChat 1.0.0 filter m/100
```

`# logresp N0CALL-10 verified` unlocks transmission; an unverified login stays
receive-only.

### Frames on air

Packets are sent as AX.25 UI frames (control `0x03`, PID `0xF0`) with the
experimental tocall `APZWCH`:

```
N0CALL-10>APZWCH,WIDE1-1,WIDE2-1::K6KJZ-9  :Meet on 145.500{0A1
```

## Tests

```bash
npm test
npm run typecheck
```

The suite covers KISS escaping and stream reassembly, AX.25 address bit
shifting, the digipeater H bit, TNC2 round-trips, message/ACK/reply-ack parsing
and text sanitisation. Position decoding is checked against worked examples in
the APRS 1.0.1 specification.

## Publishing versions (maintainers)

Tag a release; GitHub Actions builds the binaries and attaches them. See
[docs/RELEASE.md](docs/RELEASE.md).

```bash
npm run release          # patch bump, tag, push — CI publishes the binaries
```

## Limitations

- Message text is capped at 67 characters, as the APRS specification requires;
  long messages are not split into parts.
- Retransmission does not resume across a restart. Messages still awaiting an
  ACK when the backend stops are reloaded and marked as failed; a late ACK is
  still matched.
- Weather, telemetry and bulletins are kept in memory only (not in `history.json`).
- The passcode is stored in clear text in `config.json` because APRS-IS
  authentication requires it. Keep that file private.

## About

Developed by **Luis Almonte** ([HI3LAG](https://www.qrz.com/db/HI3LAG), Dominican Republic).

- QRZ: <https://www.qrz.com/db/HI3LAG>
- Email: <luis.ag@gmail.com>
- Source: <https://github.com/lalmonte/aprs-webchat>

APRS symbol graphics by Heikki Hannikainen, OH7LZB
(<https://github.com/hessu/aprs-symbols>).

## Licence

[MIT](LICENSE)
