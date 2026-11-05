import { isInstalledApp } from './lockZoom'

// In the installed iOS app the page is drawn one of two ways, set by the status-bar meta tag in
// index.html (and, it seems, fixed when the app is added to the home screen):
//
//   - translucent: the page runs under the status bar, so the safe-area top inset is the status
//     bar's height (59 on a recent iPhone). iOS reports the viewport 59px short at launch there,
//     which the standalone rules in index.css work around by using the full screen height.
//   - opaque: iOS puts a solid status bar on top and the page starts below it. The top inset is 0
//     and the viewport is already correct, so those workarounds would overshoot by the status
//     bar's height and push the bottom tab bar off the screen.
//
// So the workarounds are switched off for the opaque case. The page is marked, and index.css
// leaves the standalone rules alone when it carries data-status-bar="opaque".
//
// The catch, measured on a real phone: in the translucent case iOS reports every inset as 0 for
// the first split second after launch (top 0, bottom 0), then fills them in (59 and 34). So "top
// is 0" alone would wrongly mark a translucent app at launch. A genuinely opaque app already
// reports its bottom inset (the home indicator, 34) while the top is 0. Requiring the bottom
// inset to be present means a not-yet-ready reading is never mistaken for opaque; the worst case
// (a phone with a home button, which has no bottom inset) keeps the old behaviour.
function inset(side: 'top' | 'bottom'): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side})`
  document.body.appendChild(probe)
  const value = parseFloat(getComputedStyle(probe)[side === 'top' ? 'paddingTop' : 'paddingBottom'])
  probe.remove()
  return Number.isNaN(value) ? 0 : value
}

export function trackStatusBarStyle(): void {
  if (!isInstalledApp()) return

  const apply = () => {
    const root = document.documentElement
    if (inset('top') === 0 && inset('bottom') > 0) root.dataset.statusBar = 'opaque'
    else delete root.dataset.statusBar
  }
  // The insets can read late right after launch, so look again whenever the window changes.
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('pageshow', apply)
}
