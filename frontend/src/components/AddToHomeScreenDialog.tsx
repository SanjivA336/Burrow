import { INSTALL_STEPS, detectPlatform } from '../lib/installApp'
import { Modal } from './Modal'

// How to put Burrow on the home screen, for the platform this device is. When it can't tell
// (a computer, an unusual browser) it lists both, so the person can still follow along.
export function AddToHomeScreenDialog({ onClose }: { onClose: () => void }) {
  const platform = detectPlatform()
  const shown = platform === 'other' ? (['ios', 'android'] as const) : ([platform] as const)

  return (
    <Modal title="Add Burrow to your home screen" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Once it&apos;s on your home screen, Burrow opens full screen like an app, without the
          browser bars.
        </p>
        {shown.map((key) => (
          <div key={key}>
            {shown.length > 1 && (
              <h3 className="mb-1.5 font-semibold text-text">{INSTALL_STEPS[key].heading}</h3>
            )}
            <ol className="ml-5 list-decimal space-y-1.5 text-muted">
              {INSTALL_STEPS[key].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="rounded-control bg-primary px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
