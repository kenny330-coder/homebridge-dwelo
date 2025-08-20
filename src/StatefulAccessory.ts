import { API, Logging, PlatformAccessory } from 'homebridge';
import { DweloAPI } from './DweloAPI';

export abstract class StatefulAccessory<T> {
  protected desiredValue: T | undefined;
  protected lastUpdated = 0;

  constructor(
    protected readonly log: Logging,
    protected readonly api: API,
    protected readonly dweloAPI: DweloAPI,
    protected readonly accessory: PlatformAccessory,
  ) { }

  abstract updateState(): Promise<void>;
}
