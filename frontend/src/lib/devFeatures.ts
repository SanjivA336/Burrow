// The on/off switch for developer-only features, kept on this device (like the Appearance
// settings). It only means anything for an account that is on the developer list: other people
// never see the switch, and the server decides for real who may use those features. Turning it off
// just hides them, so a developer can see the app the way everyone else does.
//
// On by default, so a developer account behaves as it always has until they turn it off.

const KEY = 'burrow-dev-features'
const listeners = new Set<() => void>()

export function getDevFeaturesOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setDevFeaturesOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    // Storage can be blocked (private window); the switch then simply doesn't stick.
  }
  listeners.forEach((listener) => listener())
}

export function subscribeDevFeatures(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
