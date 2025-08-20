import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';



export class DweloDimmerAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value, callback) => {
        try {
          const brightness = value as boolean ? 99 : 0;
          await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer state:', error);
          await this.updateState([]);
          callback(error as Error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        // Return the current brightness. For now, we'll assume 100 if on, 0 if off.
        // In a real scenario, you'd want to fetch the actual brightness from the device.
        const isOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;
        return isOn ? 100 : 0;
      })
      .onSet(async (value, callback) => {
        try {
          const brightness = value as number;
          await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer brightness was set to: ${brightness}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer brightness:', error);
          await this.updateState([]);
          callback(error as Error);
        }
      });

    

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const isOn = sensors.find(s => s.sensorType === 'light')?.value === 'on';

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}
