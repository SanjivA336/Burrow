import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { closeCamera, openCamera, scanPhoto, scanVideo } from '../../lib/barcode'

interface Props {
  // Called once with the raw barcode number. The sheet has already turned the camera off.
  onCode: (code: string) => void
  onClose: () => void
}

// Point the camera at a barcode: it is picked up on its own (no button to press), the camera
// turns off and the sheet hands the number back. A photo can be chosen instead, which also
// covers phones or browsers where the camera can't be used.
export function BarcodeScanSheet({ onCode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraProblem, setCameraProblem] = useState<string | null>(null)
  const [photoProblem, setPhotoProblem] = useState<string | null>(null)
  const [readingPhoto, setReadingPhoto] = useState(false)
  // Kept in refs so the cleanup below can always reach the latest callback without restarting
  // the camera each time the parent re-renders.
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let scan: { stop: () => void } | null = null

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraProblem("This browser can't use the camera here. Choose a photo instead.")
        return
      }
      try {
        stream = await openCamera()
        const video = videoRef.current
        if (cancelled || !video) {
          closeCamera(stream)
          return
        }
        video.srcObject = stream
        await video.play()
        scan = scanVideo(video, (code) => {
          closeCamera(stream)
          onCodeRef.current(code)
        })
      } catch {
        if (!cancelled) {
          setCameraProblem(
            "Couldn't open the camera. Check that camera access is allowed, or choose a photo instead.",
          )
        }
      }
    }
    void start()

    // Runs on cancel, on a successful scan and if the page goes away: the camera is never left on.
    return () => {
      cancelled = true
      scan?.stop()
      closeCamera(stream)
    }
  }, [])

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    setPhotoProblem(null)
    setReadingPhoto(true)
    try {
      const code = await scanPhoto(file)
      if (code) onCode(code)
      else setPhotoProblem("Couldn't find a barcode in that photo. Try a closer, sharper one.")
    } catch {
      setPhotoProblem("Couldn't read that photo. Try another one.")
    } finally {
      setReadingPhoto(false)
    }
  }

  return (
    <Modal title="Scan a barcode" onClose={onClose}>
      {cameraProblem ? (
        <p className="mb-3 rounded-control bg-surface-hover p-3 text-sm text-muted">
          {cameraProblem}
        </p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-control bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[4/3] w-full object-cover"
              aria-label="Camera view"
            />
            {/* A guide for where to hold the barcode; the whole frame is read, not just this strip. */}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-control border-2 border-white/70" />
          </div>
          <p className="mt-2 text-center text-sm text-muted">
            Hold the barcode inside the frame. It scans by itself.
          </p>
        </>
      )}

      {photoProblem && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {photoProblem}
        </p>
      )}

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text">
        <ImageIcon size={15} strokeWidth={1.75} />
        {readingPhoto ? 'Reading photo…' : 'Choose a photo instead'}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={readingPhoto}
          onChange={(e) => {
            void handlePhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
    </Modal>
  )
}
