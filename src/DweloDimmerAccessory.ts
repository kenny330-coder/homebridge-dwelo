import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';

const POLLING_INTERVAL = 1 * 60 * 1000; // 1 minute

export class DweloDimmerAccessory extends StatefulAccessory<[boolean, number]> {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        if (this.desiredValue !== undefined && Date.now() - this.lastUpdated < POLLING_INTERVAL) {
          return this.desiredValue[0];
        }
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async value => {
        this.desiredValue = [value as boolean, this.desiredValue?.[1] || 0];
        this.lastUpdated = Date.now();
        await this.dweloAPI.toggleSwitch(value as boolean, this.accessory.context.device.uid);
        this.log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        if (this.desiredValue !== undefined && Date.now() - this.lastUpdated < POLLING_INTERVAL) {
          return this.desiredValue[1];
        }
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
      })
      .onSet(async value => {
        this.desiredValue = [this.desiredValue?.[0] || false, value as number];
        this.lastUpdated = Date.now();
        await this.dweloAPI.setBrightness(value as number, this.accessory.context.device.uid);
        this.log.debug(`Dimmer brightness was set to: ${value}`);
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(): Promise<void> {
    const sensors = await this.dweloAPI.sensors(this.accessory.context.device.uid);
    const isOn = sensors.find(s => s.sensorType === 'light')?.value === 'on';
    const brightness = sensors.find(s => s.sensorType === 'Dimmer')?.value;

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(parseInt(brightness || '0', 10));

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, brightness: ${brightness}`);
  }
}
