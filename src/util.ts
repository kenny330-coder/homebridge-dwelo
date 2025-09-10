import { Logging } from 'homebridge';

export class PollAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollAbortedError';
  }
}

export function poll<T>({ requestFn, stopCondition, interval, timeout, log, logPrefix, signal }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
  log?: Logging;
  logPrefix?: string;
  signal?: AbortSignal;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let attempt = 0;
    let pollIntervalId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (pollIntervalId) clearTimeout(pollIntervalId);
      signal?.removeEventListener('abort', onAbort);
    };

    const executePoll = async () => {
      if (signal?.aborted) return; // Abort listener will reject
      attempt++;
      // Check for timeout before making the request
      if (Date.now() - startTime > timeout) {
        const message = `${logPrefix || 'Polling'} timed out after ${attempt - 1} attempts.`;
        if (log) {
          log.warn(message);
        }
        cleanup();
        reject(new Error(message));
        return;
      }
      try {
        const result = await requestFn();
        if (signal?.aborted) return; // Aborted during request

        if (stopCondition(result)) {
          // Condition met, we're done.
          if (log) {
            log.debug(`${logPrefix || 'Polling'} confirmed state after ${attempt} attempts.`);
          }
          cleanup();
          resolve(result);
        } else {
          // Condition not met, poll again after the interval.
          pollIntervalId = setTimeout(executePoll, interval);
        }
      } catch (error) {
        // If the request itself fails, we should stop and reject.
        if (log) {
          log.error(`${logPrefix || 'Polling'} failed on attempt ${attempt}:`, error);
        }
        cleanup();
        reject(error);
      }
    };

    const onAbort = () => {
      const message = `${logPrefix || 'Polling'} was cancelled.`;
      if (log) log.debug(message);
      cleanup();
      reject(new PollAbortedError(message));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    // Start the first poll.
    executePoll();
  });
}
