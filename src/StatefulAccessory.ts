import { API, Logging, PlatformAccessory } from 'homebridge';
import { DweloAPI } from './DweloAPI';

const UPDATE_INTERVAL = 5000; // 5 seconds

export abstract class StatefulAccessory {
  constructor(
    protected readonly log: Logging,
    protected readonly api: API,
    protected readonly dweloAPI: DweloAPI,
    protected readonly accessory: PlatformAccessory,
  ) {
    this.startUpdating();
  }

  abstract updateState(): Promise<void>;

  private startUpdating() {
    this.updateState();
    setInterval(() => {
      this.updateState();
    }, UPDATE_INTERVAL);
  }
}
