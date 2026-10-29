// Updates: announcements, one markdown file each in src/updates/. They are bundled into the app
// when it is built (no network request, no database), so adding one is "write a file, deploy".
// Keep each one to a few seconds of reading; longer pieces belong on the marketing site.
//
// A file starts with a short header between two "---" lines, then the note in markdown:
//
//   ---
//   title: Make Burrow yours   (read aloud by screen readers; not shown)
//   caption: v0.14.0           (shown in the middle of the banner; for release notes, the version)
//   date: 2026-10-29
//   major: true                (optional: opens by itself, once, the first time someone sees it)
//   ---
//   Some text, **bold**, and bullets.
//
// Every note gets the same marble banner, recoloured to the chosen accent (see UpdatesModal).
// The file's name (without .md) is the note's id. The saved "read" state remembers the id of the
// newest note someone opened, so keep ids stable once published.

export interface Update {
  id: string
  title: string
  caption: string
  date: string // YYYY-MM-DD
  major: boolean
  body: string
}

// How many of the newest articles the card shows.
export const MAX_UPDATES = 5

const files = import.meta.glob('../updates/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseUpdate(id: string, source: string): Update | null {
  const match = HEADER.exec(source)
  if (!match) return null
  const fields: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  if (!fields.title || !fields.caption || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? ''))
    return null
  return {
    id,
    title: fields.title,
    caption: fields.caption,
    date: fields.date,
    major: fields.major === 'true',
    body: match[2].trim(),
  }
}

// Newest first.
export const UPDATES: Update[] = Object.entries(files)
  .map(([path, source]) => parseUpdate(path.replace(/^.*\//, '').replace(/\.md$/, ''), source))
  .filter((u): u is Update => u !== null)
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  .slice(0, MAX_UPDATES)

const SEEN_KEY = 'burrow-updates-seen'

export function getSeenUpdateId(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function setSeenUpdateId(id: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, id)
  } catch {
    // Not saved; the dot comes back next visit, which is harmless.
  }
}

// Unread means the newest article is not the one last opened on this device. An account made
// after the article was written starts with it counted as read, so a new person is not greeted
// with news about changes they never saw.
export function isUpdateUnread(
  latest: Update | undefined,
  seenId: string | null,
  accountCreatedAt: string | undefined,
): boolean {
  if (!latest || seenId === latest.id) return false
  if (accountCreatedAt && accountCreatedAt.slice(0, 10) > latest.date) return false
  return true
}
