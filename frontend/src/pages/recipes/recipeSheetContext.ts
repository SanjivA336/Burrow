import { createContext, useContext } from 'react'

// The recipe form's id, so the check mark in the sheet's header (outside the <form>) can submit it.
export const RECIPE_FORM_ID = 'recipe-form'

// How the form tells the header it is busy saving, so the check mark can switch itself off.
export const BusyContext = createContext<(busy: boolean) => void>(() => {})
export const useSetSheetBusy = () => useContext(BusyContext)
