import { Navigate, useParams } from 'react-router-dom'

// Item pages used to live at /households/:id/inventory-items/:itemId. They are a
// sheet now, so an old link or bookmark lands on the inventory with it open.
export function ItemLinkRedirect() {
  const { householdId, itemId } = useParams<{ householdId: string; itemId: string }>()
  return <Navigate to={`/households/${householdId}?item=${itemId}`} replace />
}
