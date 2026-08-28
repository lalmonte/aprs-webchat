import { useEffect } from 'react';

import type { AppUpdateInfo, ClientIdentity } from '../types';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  appVersion?: string | null;
  clientIdentity?: ClientIdentity | null;
  update?: AppUpdateInfo | null;
}

const AUTHOR = {
  name: 'Luis Almonte',
  callsign: 'HI3LAG',
  qrz: 'https://www.qrz.com/db/HI3LAG',
  email: 'luis.ag@gmail.com',
  github: 'https://github.com/lalmonte/aprs-webchat',
};

/** About dialog: author name, callsign, QRZ profile and contact email. */
export function AboutModal({ open, onClose, appVersion, clientIdentity, update }: AboutModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal modal-open z-[2000]"
      role="dialog"
      aria-modal="true"
      aria-label="About"
    >
      <div className="modal-box max-h-[min(92dvh,40rem)] w-[calc(100%-1rem)] max-w-md overflow-y-auto border border-white/10 bg-slate-900/95 p-4 backdrop-blur sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">About</h3>
            <p className="text-xs text-slate-400">
              APRS WebChat{appVersion ? ` ${appVersion}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
            aria-label="Close about"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-emerald-400 text-sm font-bold text-slate-950">
              HI3
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Developed by</p>
              <p className="text-lg font-bold tracking-wide text-sky-300">{AUTHOR.name}</p>
              <p className="font-mono text-sm text-slate-300">{AUTHOR.callsign}</p>
              <p className="text-[11px] text-slate-500">Dominican Republic</p>
            </div>
          </div>

          <dl className="space-y-3 rounded-xl border border-white/5 bg-black/25 p-4 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Author
              </dt>
              <dd className="mt-0.5 text-slate-100">{AUTHOR.name}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Callsign
              </dt>
              <dd className="mt-0.5 font-mono text-slate-100">{AUTHOR.callsign}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                QRZ
              </dt>
              <dd className="mt-0.5">
                <a
                  href={AUTHOR.qrz}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sky-300 underline-offset-2 hover:underline"
                >
                  {AUTHOR.qrz}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Email
              </dt>
              <dd className="mt-0.5">
                <a
                  href={`mailto:${AUTHOR.email}`}
                  className="break-all text-sky-300 underline-offset-2 hover:underline"
                >
                  {AUTHOR.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Version
              </dt>
              <dd className="mt-0.5 font-mono text-slate-100">{appVersion ?? '—'}</dd>
            </div>
            {clientIdentity ? (
              <>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    RF tocall
                  </dt>
                  <dd className="mt-0.5 font-mono text-slate-100">{clientIdentity.rfTocall}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    APRS-IS client
                  </dt>
                  <dd className="mt-0.5 font-mono text-slate-100">{clientIdentity.vers}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Source
              </dt>
              <dd className="mt-0.5">
                <a
                  href={AUTHOR.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sky-300 underline-offset-2 hover:underline"
                >
                  {AUTHOR.github}
                </a>
              </dd>
            </div>
          </dl>

          {update ? (
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-100">
              <p className="font-semibold">New release {update.latestVersion}</p>
              <p className="mt-1 text-sky-200/90">
                This station is running {update.currentVersion}. Get the binary for your
                platform from GitHub.
              </p>
              <a
                href={update.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-xs btn-info mt-2"
              >
                Open release
              </a>
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Amateur radio software for APRS messaging over Direwolf (KISS TCP) and
            APRS-IS. Transmitting requires a valid amateur radio licence.
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Map symbols by Heikki Hannikainen, OH7LZB (
            <a
              href="https://github.com/hessu/aprs-symbols"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              hessu/aprs-symbols
            </a>
            ).
          </p>
        </div>

        <div className="modal-action mt-4">
          <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
    </div>
  );
}
