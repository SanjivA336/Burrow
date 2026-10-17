// Past either end of a swipe the row doesn't stop dead: it keeps following the
// finger, but less and less (a stretching rubber band, the same curve as pull to
// refresh). With over = MAX_OVERSHOOT * (1 - e^(-drag / STRETCH)), the first 50px
// past the end moves it about 17px and the next 50px only about 9px more.
export const MAX_OVERSHOOT = 36
export const STRETCH = 80

const resist = (drag: number) => MAX_OVERSHOOT * (1 - Math.exp(-drag / STRETCH))

// Maps where the finger is (0 = closed, in px) to where the row goes, adding
// resistance past both ends. Negative is a swipe left, which stops at -rightLimit
// (the room for the actions on the right); positive is a swipe right, which stops
// at +leftLimit (the room for the actions on the left; 0 when there are none).
export function withResistance(raw: number, rightLimit: number, leftLimit = 0): number {
  if (raw > leftLimit) return leftLimit + resist(raw - leftLimit)
  if (raw < -rightLimit) return -(rightLimit + resist(-rightLimit - raw))
  return raw
}
