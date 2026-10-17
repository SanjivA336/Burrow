import { useContext } from 'react'
import { TourContext } from './tourContext'

// Outside the household shell there is no tour, so `start` does nothing there.
export function useTour() {
  const api = useContext(TourContext)
  return { start: api ? api.start : () => {} }
}
