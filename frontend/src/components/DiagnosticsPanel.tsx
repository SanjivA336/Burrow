import { useEffect, useState } from 'react'
import {
  formatLog,
  fullSnapshot,
  setDiagnosticsOn,
  useDiagnosticsLog,
  useDiagnosticsOn,
} from '../lib/diagnostics'

// The readout itself. Mounted once at the app root and shown whenever the saved
// flag is on, so it is still there after closing and reopening the app, which
// is what lets it capture a layout problem that only exists at launch.
function Panel() {
  const [now, setNow] = useState(fullSnapshot)
  const [copied, setCopied] = useState(false)
  // Collapsed to a small pill so the screen underneath can be used (the panel covers half of
  // it). The log keeps recording either way; it starts at app launch, not when this opens.
  const [collapsed, setCollapsed] = useState(false)
  const entries = useDiagnosticsLog()

  useEffect(() => {
    const timer = setInterval(() => setNow(fullSnapshot()), 1000)
    return () => clearInterval(timer)
  }, [])

  const log = formatLog(entries)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show diagnostics"
        className="fixed right-2 top-2 z-50 rounded-pill border border-subtle bg-surface/95 px-3 py-1 text-xs font-semibold text-text shadow-raised"
      >
        Diag
      </button>
    )
  }

  return (
    <div className="fixed inset-x-2 top-14 z-50 rounded-card border border-subtle bg-surface/95 p-3 text-text shadow-raised">
      <pre className="max-h-[52dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug">
        {`CHANGE LOG (since launch; a new line each time a value changes)\n${log}\n\nNOW\n${now}`}
      </pre>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(`${log}\n\n${now}`).then(() => setCopied(true))
          }}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-on-accent"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-control border border-subtle px-3 py-1.5 text-sm text-text"
        >
          Hide
        </button>
        <button
          type="button"
          onClick={() => setDiagnosticsOn(false)}
          className="rounded-control border border-subtle px-3 py-1.5 text-sm text-muted"
        >
          Close (turns off)
        </button>
      </div>
    </div>
  )
}

export function DiagnosticsHost() {
  return useDiagnosticsOn() ? <Panel /> : null
}
