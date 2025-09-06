import { API, Logging, PlatformAccessory } from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

export abstract class StatefulAccessory {
  constructor(
    protected readonly platform: HomebridgePluginDweloPlatform,
    protected readonly log: Logging,
    protected readonly api: API,
    protected readonly dweloAPI: DweloAPI,
    public readonly accessory: PlatformAccessory,
  ) { }

  abstract updateState(sensors: Sensor[]): Promise<void>;

  public async refresh(): Promise<void> {
    const sensors = await this.platform.getSensors();
    const accessorySensors = sensors.filter(s => s.deviceId === this.accessory.context.device.uid);
    await this.updateState(accessorySensors);
  }
}
