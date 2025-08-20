import { API, Logging, PlatformAccessory } from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';

export abstract class StatefulAccessory {
  constructor(
    protected readonly log: Logging,
    protected readonly api: API,
    protected readonly dweloAPI: DweloAPI,
    public readonly accessory: PlatformAccessory,
  ) { }

  abstract updateState(sensors: Sensor[]): Promise<void>;
}
