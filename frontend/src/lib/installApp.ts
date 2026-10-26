import { isInstalledApp } from './lockZoom'

export type Platform = 'ios' | 'android' | 'other'

// Which kind of phone this is, for telling the person how to add Burrow to their home screen.
// An iPad reports itself as a Mac, but a Mac with a touch screen is an iPad.
export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

// True in a phone or tablet browser where Burrow is not installed yet: the only place the tip
// and the Settings row are worth showing. Computers, and the installed app itself, never see them.
export function canSuggestInstall(): boolean {
  return detectPlatform() !== 'other' && !isInstalledApp()
}

// The steps, as short lines for the Settings dialog.
export const INSTALL_STEPS = {
  ios: {
    heading: 'iPhone and iPad',
    steps: [
      'Open Burrow in Safari. A link opened inside another app (Instagram, Messenger) can’t do this.',
      'Tap the Share button.',
      'Choose Add to Home Screen, then tap Add.',
    ],
  },
  android: {
    heading: 'Android',
    steps: [
      'Open Burrow in Chrome.',
      'Tap the ⋮ menu.',
      'Choose Install app (or Add to Home screen).',
    ],
  },
} as const

// One sentence for the last card of the tour.
export function installTip(platform: Platform): string | null {
  if (platform === 'ios') {
    return 'Tip: add Burrow to your home screen so it opens like an app. In Safari, tap Share, then Add to Home Screen.'
  }
  if (platform === 'android') {
    return 'Tip: add Burrow to your home screen so it opens like an app. In Chrome, tap the ⋮ menu, then Install app.'
  }
  return null
}
