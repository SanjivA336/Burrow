// Which burrow someone last opened, so the app can open it again at launch.
//
// Kept in this browser's localStorage only (never on the server), so it does not follow anyone to
// another phone or computer. The key includes the account's id, so two accounts that share a device
// each get their own. Every read and write is wrapped, because storage can be blocked (a private
// window) and the app must work without it.
//
// Only the id is stored. Whether the person can still open that burrow is decided at launch by
// asking the server for their burrows (see HouseholdPickerPage), never trusted from here.

function key(userId: string): string {
  return `burrow-last-burrow:${userId}`
}

export function getLastBurrow(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId))
  } catch {
    return null
  }
}

export function rememberBurrow(userId: string, householdId: string): void {
  try {
    localStorage.setItem(key(userId), householdId)
  } catch {
    // Not being able to remember is fine; the picker simply shows.
  }
}

export function forgetLastBurrow(userId: string): void {
  try {
    localStorage.removeItem(key(userId))
  } catch {
    // Nothing to do.
  }
}
