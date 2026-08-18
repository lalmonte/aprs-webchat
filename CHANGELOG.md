# Changelog

All notable changes to APRS WebChat are documented in this file.

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
