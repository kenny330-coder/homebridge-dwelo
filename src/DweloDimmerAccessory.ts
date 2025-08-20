import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';



export class DweloDimmerAccessory extends StatefulAccessory<[boolean, number]> {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value, callback) => {
        this.desiredValue = [value as boolean, this.desiredValue?.[1] || 0];
        this.lastUpdated = Date.now();
        try {
          await this.dweloAPI.setDimmerState(value as boolean, this.desiredValue?.[1] || 0, this.accessory.context.device.uid);
          this.log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer state:', error);
          await this.updateState([]); // Pass empty array as sensors are fetched by platform
          callback(error as Error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
      })
      .onSet(async (value, callback) => {
        this.desiredValue = [this.desiredValue?.[0] || false, value as number];
        this.lastUpdated = Date.now();
        try {
          await this.dweloAPI.setDimmerState(this.desiredValue?.[0] || false, value as number, this.accessory.context.device.uid);
          this.log.debug(`Dimmer brightness was set to: ${value}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer brightness:', error);
          await this.updateState([]); // Pass empty array as sensors are fetched by platform
          callback(error as Error);
        }
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const isOn = sensors.find(s => s.sensorType === 'light')?.value === 'on';
    const brightness = sensors.find(s => s.sensorType === 'Dimmer')?.value;

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(parseInt(brightness || '0', 10));

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, brightness: ${brightness}`);
  }
}
