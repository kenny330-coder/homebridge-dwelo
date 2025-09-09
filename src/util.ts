import { Logging } from 'homebridge';

export function poll<T>({ requestFn, stopCondition, interval, timeout, log, logPrefix }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
  log?: Logging;
  logPrefix?: string;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let attempt = 0;

    const executePoll = async () => {
      attempt++;
      // Check for timeout before making the request
      if (Date.now() - startTime > timeout) {
        const message = `${logPrefix || 'Polling'} timed out after ${attempt - 1} attempts.`;
        if (log) {
          log.warn(message);
        }
        reject(new Error(message));
        return;
      }
      try {
        const result = await requestFn();
        if (stopCondition(result)) {
          // Condition met, we're done.
          if (log) {
            log.debug(`${logPrefix || 'Polling'} confirmed state after ${attempt} attempts.`);
          }
          resolve(result);
        } else {
          // Condition not met, poll again after the interval.
          setTimeout(executePoll, interval);
        }
      } catch (error) {
        // If the request itself fails, we should stop and reject.
        if (log) {
          log.error(`${logPrefix || 'Polling'} failed on attempt ${attempt}:`, error);
        }
        reject(error);
      }
    };
    // Start the first poll.
    executePoll();
  });
}
