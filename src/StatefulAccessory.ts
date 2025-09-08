import { API, Logging, PlatformAccessory } from 'homebridge';
import { DweloAPI, LightAndSwitch, Lock, Thermostat } from './DweloAPI';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

export abstract class StatefulAccessory {
  constructor(
    protected readonly platform: HomebridgePluginDweloPlatform,
    protected readonly log: Logging,
    protected readonly api: API,
    protected readonly dweloAPI: DweloAPI,
    public readonly accessory: PlatformAccessory,
  ) { }

  abstract updateState(device: LightAndSwitch | Lock | Thermostat): Promise<void>;

  public async refresh(): Promise<void> {
    const status = await this.platform.getRefreshedStatusData();
    const devices = [
      ...status['LIGHTS AND SWITCHES'],
      ...status.LOCKS,
      ...status.THERMOSTATS,
    ];
    const device = devices.find(d => d.device_id === this.accessory.context.device.device_id);
    if (device) {
      await this.updateState(device);
    }
  }
}