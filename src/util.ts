export function poll<T>({ requestFn, stopCondition, interval, timeout }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
}): Promise<T> {
  let stop = false;
  let attempt = 1;

  const executePoll = async (resolve: (r: T) => unknown, reject: (e: Error) => void) => {
    const result = await requestFn();

    let stopConditionalResult: boolean;
    try {
      stopConditionalResult = stopCondition(result);
    } catch (e) {
      reject(e as Error);
      return;
    }

    if (stopConditionalResult) {
      resolve(result);
    } else if (stop) {
      reject(new Error('timeout'));
    } else {
      setTimeout(executePoll, interval * Math.pow(2, attempt++), resolve, reject);
    }
  };

  const pollResult = new Promise<T>(executePoll);
  const maxTimeout = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Exceeded max timeout'));
      stop = true;
    }, timeout);
  });

  return Promise.race([pollResult, maxTimeout]);
}
