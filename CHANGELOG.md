# Changelog

All notable changes to APRS WebChat are documented in this file.

## 1.1.3 — 2026-08-27

- Identify the client on RF and APRS-IS: tocall `APZWCH`, login `vers APRSWebChat`,
  beacon comments include **APRS WebChat** when empty or when space allows. Shown in
  Configuration and About.
- Fix map basemap: switch from CARTO (API key required) to Esri World Dark Gray tiles.

## 1.1.2 — 2026-08-18

- Sign macOS release binaries on a macOS GitHub runner so Apple Silicon
  downloads are not killed at launch.

## 1.1.1 — 2026-08-18

- Notify operators when GitHub has a newer tagged release: dismissible banner,
  About badge, and a download link. Disable with `APRS_UPDATE_CHECK=0`.

## 1.1.0 — 2026-08-18

- Credit the author as Luis Almonte (HI3LAG) in the licence, README, package
  metadata and the in-app About dialog.

## 1.0.0 — 2026-08-18

First public release.

- Dual-transport APRS messaging: local Direwolf over KISS TCP, and APRS-IS.
- AX.25 / KISS encode and decode, including digipeater H-bit handling.
- Message acknowledgements with retries (classic `ackNN` and APRS 1.2 reply-ack).
- Live map of position reports (uncompressed, compressed, Mic-E, objects/items)
  using official APRS symbol sprites. Clear-map control included.
- Weather, telemetry and `BLN…` bulletins on dedicated tabs.
- Position beacon configurable from the UI.
- Chat history and last-heard positions persisted on disk.
- Standalone binaries for Windows, Linux, macOS and 64-bit Raspberry Pi.
- Android companion UI is in the source tree but **not** part of this release.
