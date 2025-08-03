export class CachedRequest<T> {
  private cache: T | undefined;
  private lastRequest = 0;

  constructor(private readonly ttl: number, private readonly request: () => Promise<T>) { }

  public get(): Promise<T> {
    if (this.cache && this.lastRequest + this.ttl > Date.now()) {
      return Promise.resolve(this.cache);
    }

    this.lastRequest = Date.now();
    return this.request().then(d => this.cache = d);
  }

  public clear() {
    this.cache = undefined;
    this.lastRequest = 0;
  }
}
