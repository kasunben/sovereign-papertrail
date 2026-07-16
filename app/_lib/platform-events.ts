import { sdk } from '@sovereignfs/sdk';
import type { ActivityLogEntry } from '@sovereignfs/sdk';

export async function recordActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    await sdk.activity.log(entry);
  } catch {
    // never let an activity-log failure surface to the user
  }
}
