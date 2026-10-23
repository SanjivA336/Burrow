import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { toggleDiagnostics } from '../lib/diagnostics'

interface Props {
  className?: string
}

// "Burrow — v0.9.1": the app's name and version (from package.json, baked in
// at build time). Small and quiet on purpose: it's there so anyone reporting a
// problem can say which version they were on. Tapping it five times in a row
// turns the layout diagnostics readout on or off (see lib/diagnostics.ts).
export function AppVersion({ className = '' }: Props) {
  const taps = useRef({ count: 0, last: 0 })

  const handleTap = () => {
    const now = Date.now()
    taps.current.count = now - taps.current.last < 800 ? taps.current.count + 1 : 1
    taps.current.last = now
    if (taps.current.count >= 5) {
      taps.current.count = 0
      toggleDiagnostics()
    }
  }

  return (
    <div className={`text-xs text-muted ${className}`}>
      <p onClick={handleTap} className="select-none">
        Burrow — v{__APP_VERSION__}
      </p>
      <p className="mt-0.5">
        © 2026 Sanjiv Anand ·{' '}
        <Link to="/licenses" className="underline hover:text-text">
          Open-source licenses
        </Link>
      </p>
    </div>
  )
}
