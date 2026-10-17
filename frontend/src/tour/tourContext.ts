import { createContext } from 'react'

export interface TourApi {
  // Starts the tour from the welcome card (used by Settings -> "Take the tour").
  start: () => void
}

export const TourContext = createContext<TourApi | null>(null)
