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

  public async refresh(): Promise<void> {
    const sensors = await this.dweloAPI.sensors(this.accessory.context.device.uid);
    await this.updateState(sensors);
  }
}
