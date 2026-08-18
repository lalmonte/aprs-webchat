# Contributing

Bug reports and patches from amateur radio operators are welcome.

## Issues

Open an issue at <https://github.com/lalmonte/aprs-webchat/issues>. Please include:

- Your callsign and SSID
- Operating system
- Whether you are using a **binary** or running from **source**
- Direwolf version and a short excerpt of its console, if RF is involved
- What you expected, and what happened instead

Do **not** paste your APRS-IS passcode or the contents of `data/config.json`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep changes focused. Match the surrounding code style.
3. Run `npm test` and `npm run typecheck` before you open the PR.
4. Describe the amateur-radio impact (RF, APRS-IS, map, messaging) in the PR body.

Source and protocol files live under `server/src/`. The dashboard is `web/src/`.
Keep `server/src/types.ts` and `web/src/types.ts` in sync when you change socket
events or shared shapes.

## Licence

Contributions are accepted under the MIT Licence (see `LICENSE`).
