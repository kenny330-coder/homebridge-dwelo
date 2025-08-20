import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';

const POLLING_INTERVAL = 1 * 60 * 1000; // 1 minute

export class DweloSwitchAccessory extends StatefulAccessory<boolean> {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Switch) || this.accessory.addService(this.api.hap.Service.Switch);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        if (this.desiredValue !== undefined && Date.now() - this.lastUpdated < POLLING_INTERVAL) {
          return this.desiredValue;
        }
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async value => {
        this.desiredValue = value as boolean;
        this.lastUpdated = Date.now();
        await this.dweloAPI.setSwitchState(value as boolean, this.accessory.context.device.uid);
        this.log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
      });

    this.log.info(`Dwelo Switch '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const isOn = sensors[0]?.value === 'on';
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.log.debug(`Switch state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}
