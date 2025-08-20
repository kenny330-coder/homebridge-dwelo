import {
  API,
  Logging,
  PlatformAccessory,
  Service,
  CharacteristicSetCallback,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';

const POLLING_INTERVAL = 1 * 60 * 1000; // 1 minute

export class DweloSwitchAccessory extends StatefulAccessory<boolean> {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Switch) || this.accessory.addService(this.api.hap.Service.Switch);

    export class DweloSwitchAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Switch) || this.accessory.addService(this.api.hap.Service.Switch);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value, callback) => {
        try {
          await this.dweloAPI.setSwitchState(value as boolean, this.accessory.context.device.uid);
          this.log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set switch state:', error);
          await this.updateState([]);
          callback(error as Error);
        }
      });

    this.log.info(`Dwelo Switch '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const isOn = sensors[0]?.value === 'on';
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.log.debug(`Switch state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}
