import { useSyncExternalStore } from 'react'
import { cloudEval, setCloudEnabled, type CloudStatus } from './cloudEval'

let snapshot: CloudStatus = cloudEval.status()
const same = (a: CloudStatus, b: CloudStatus) => a.state === b.state && a.until === b.until

/** Live Lichess cloud status (on / off / paused after a rate limit or outage). */
export function useCloudStatus(): { status: CloudStatus; enabled: boolean; setEnabled: (on: boolean) => void } {
  const status = useSyncExternalStore(
    (cb) => cloudEval.subscribe(cb),
    () => {
      const next = cloudEval.status()
      if (!same(snapshot, next)) snapshot = next
      return snapshot
    },
  )
  return { status, enabled: cloudEval.isEnabled(), setEnabled: setCloudEnabled }
}
