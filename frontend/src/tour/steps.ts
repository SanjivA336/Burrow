// The guided tour's content: one entry per step ("chapter"). To change what the tour
// says or which areas it covers, this is the only file to edit. To remove the tour
// entirely, delete the whole frontend/src/tour folder and the few `data-tour`
// attributes and the TourProvider / "Take the tour" lines that point at it.
//
// How a chapter is shown:
//   - `kind: 'welcome'` / `'finish'` are plain cards with no spotlight.
//   - Otherwise it is "explain" when the person is on the chapter's page, and "go"
//     when they are not. The "go" card lights up the thing to tap (a tab, a row) and
//     waits; the tour never navigates for them (except once, when Start is pressed).
//     Which phase to show is worked out from the address alone, so there is no phase
//     to remember and pressing the back button simply shows the "go" card again.

export interface GoHint {
  // `data-tour` value(s) to light up; the first one that is on screen wins.
  target: string | string[]
  // Show this hint when the current page (without the /households/<id> part) matches.
  from: (rel: string) => boolean
  text: string
}

export interface Chapter {
  id: string
  kind?: 'welcome' | 'finish'
  // Where the explain card belongs.
  page: (rel: string) => boolean
  title: string
  body: string
  // Phone wording, when it should differ from `body`.
  phoneBody?: string
  // What to light up on the explain card; none means the whole page area.
  target?: string | string[]
  // How to get to the page. The first hint whose `from` matches is shown.
  go?: GoHint[]
}

// The address without /households/<id>: '/' for the inventory, '/balances', ...
export function relativePath(pathname: string): string {
  return pathname.replace(/^\/households\/[^/]+/, '') || '/'
}

const onInventory = (rel: string) => rel === '/' || rel.startsWith('/storage/')
const anywhere = () => true

const toInventory: GoHint[] = [
  { target: 'nav-inventory', from: anywhere, text: 'Tap Inventory to go back to your list.' },
]

export const CHAPTERS: Chapter[] = [
  {
    id: 'welcome',
    kind: 'welcome',
    page: anywhere,
    title: 'Welcome to Burrow',
    body: 'A quick tour of the places you will use most. It takes about a minute, and it will not add or change anything.',
  },
  {
    id: 'inventory',
    page: onInventory,
    title: 'Your inventory',
    body: 'Everything your burrow has, in one list. Click an item to edit it, change its expiry date or move it somewhere else.',
    phoneBody:
      'Everything your burrow has, in one list. Tap an item to edit it. Swipe an item left for Empty, Expired and Void.',
    go: toInventory,
  },
  {
    id: 'add',
    page: onInventory,
    title: 'Add what you buy',
    body: 'Use this whenever you bring groceries home: pick the food, how much, what it cost, who bought it and who shares it. We will not add anything during the tour.',
    target: ['add-fab', 'add'],
    go: toInventory,
  },
  {
    id: 'storage',
    page: onInventory,
    title: 'Pantry, fridge and freezer',
    body: 'Filter by where things are kept. Moving an item between them updates its expiry date for you.',
    target: 'storage-filter',
    go: toInventory,
  },
  {
    id: 'warnings',
    page: onInventory,
    title: 'Warnings',
    body: 'Items that are about to expire, or running low, collect here so nothing quietly goes bad.',
    target: 'warnings',
    go: toInventory,
  },
  {
    id: 'shopping',
    page: (rel) => rel === '/shopping-list',
    title: 'Shopping list',
    body: 'One list for the whole burrow. Add what you need, and low or empty items can be suggested for you.',
    go: [{ target: 'nav-shopping', from: anywhere, text: 'Tap Shopping List.' }],
  },
  {
    id: 'recipes',
    page: (rel) => rel.startsWith('/recipes'),
    title: 'Recipes',
    body: 'Your own recipe box. Each recipe shows which ingredients you already have in the burrow.',
    go: [{ target: 'nav-recipes', from: anywhere, text: 'Tap Recipes.' }],
  },
  {
    id: 'balances',
    page: (rel) => rel === '/balances',
    title: 'Balances',
    body: 'Who owes whom. Costs are split between the people who share each item, and you can record a payment here when someone pays someone back.',
    go: [{ target: 'nav-balances', from: anywhere, text: 'Tap Balances.' }],
  },
  {
    id: 'invite',
    page: anywhere,
    title: 'Invite your roommates',
    body: 'Share this code and anyone can join your burrow from the Join screen. Everyone in it sees the same inventory and splits costs together.',
    target: 'join-code',
  },
  {
    id: 'activity',
    page: (rel) => rel.startsWith('/settings/activity'),
    title: 'Activity',
    body: 'A running feed of what everyone did: items added, used up or thrown out, and payments recorded.',
    go: [
      {
        target: 'settings-activity',
        from: (rel) => rel.startsWith('/settings'),
        text: 'Tap Activity.',
      },
      { target: 'nav-settings', from: anywhere, text: 'Tap Settings.' },
    ],
  },
  {
    id: 'finish',
    kind: 'finish',
    page: anywhere,
    title: "That's the tour",
    body: 'You can take it again any time from Settings, under "Take the tour".',
  },
]
