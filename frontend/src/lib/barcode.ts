// Reads retail barcodes from the camera or from a photo.
//
// The decoder (the `barcode-detector` package) uses the browser's built-in BarcodeDetector where
// there is one (Chrome on Android) and a WebAssembly decoder where there isn't (iPhone Safari).
// It is imported on demand, so people who never scan never download it.

// Retail product formats only. Ignoring QR codes and the like is faster and avoids picking up
// a stray code on the package.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

type Detector = { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> }

let detectorPromise: Promise<Detector> | null = null

function getDetector(): Promise<Detector> {
  detectorPromise ??= import('barcode-detector/ponyfill').then(
    ({ BarcodeDetector }) => new BarcodeDetector({ formats: [...FORMATS] }) as Detector,
  )
  return detectorPromise
}

// How often the live video is checked, and how many checks in a row must agree. A blurry,
// half-visible barcode can decode as the wrong number for a frame; two matching reads in a row
// (on top of the check digit the server verifies) make a wrong accept very unlikely.
const FRAME_INTERVAL_MS = 150
const AGREEING_READS = 2

export interface CameraScan {
  // Stops the loop and releases the camera. Safe to call more than once.
  stop: () => void
}

// Starts reading `video` (already playing a camera stream) and calls `onCode` once with the
// first barcode seen on consecutive reads.
export function scanVideo(video: HTMLVideoElement, onCode: (code: string) => void): CameraScan {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRead = ''
  let agreeing = 0

  const tick = async () => {
    if (stopped) return
    try {
      if (video.readyState >= 2) {
        const detector = await getDetector()
        const found = await detector.detect(video)
        const code = found[0]?.rawValue ?? ''
        if (code && code === lastRead) agreeing += 1
        else agreeing = code ? 1 : 0
        lastRead = code
        if (agreeing >= AGREEING_READS && !stopped) {
          stopped = true
          onCode(code)
          return
        }
      }
    } catch {
      // A frame that fails to decode is just a frame without a barcode.
    }
    if (!stopped) timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS)
  }
  void tick()

  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}

// Phone photos are 10+ megapixels; the decoder works as well on a much smaller copy, and is a
// lot faster. Barcodes are wide, so the long side is what matters.
const MAX_PHOTO_SIDE = 1600

async function shrunk(file: File): Promise<ImageBitmapSource> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) return bitmap
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

// The barcode in a photo, or null if none could be read.
export async function scanPhoto(file: File): Promise<string | null> {
  const detector = await getDetector()
  const found = await detector.detect(await shrunk(file))
  return found[0]?.rawValue ?? null
}

// Opens the back camera. Rejects if there is no camera or permission was refused.
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
}

// Turns the camera off (and, on a phone, its indicator light).
export function closeCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}
