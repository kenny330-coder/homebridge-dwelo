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
  private onSetTimeout: NodeJS.Timeout | null = null;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        if (this.onSetTimeout) {
          clearTimeout(this.onSetTimeout);
          this.onSetTimeout = null;
        }
        if (value) { // Turning On
          this.onSetTimeout = setTimeout(() => {
            this.dweloAPI.setDimmerState(true, this.accessory.context.device.uid);
            this.log.debug('Dimmer state was set to: ON (from OnSet)');
            setTimeout(() => this.refresh(), 2000);
            this.onSetTimeout = null;
          }, 100);
        } else { // Turning Off
          await this.dweloAPI.setDimmerState(false, this.accessory.context.device.uid);
          this.log.debug('Dimmer state was set to: OFF');
          setTimeout(() => this.refresh(), 2000);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        const isOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;
        return isOn ? 100 : 0;
      })
      .onSet(async (value) => {
        if (this.onSetTimeout) {
          clearTimeout(this.onSetTimeout);
          this.onSetTimeout = null;
        }
        const brightness = value as number;
        if (brightness === 0) {
          await this.dweloAPI.setDimmerState(false, this.accessory.context.device.uid);
          this.log.debug(`Dimmer set to OFF (brightness 0)`);
        } else if (brightness === 100) {
          await this.dweloAPI.setDimmerState(true, this.accessory.context.device.uid);
          this.log.debug(`Dimmer set to ON (brightness 100)`);
        } else {
          await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer brightness was set to: ${brightness}`);
        }
        setTimeout(() => this.refresh(), 2000);
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const lightSensor = sensors.find(s => s.sensorType === 'light');
    const isOn = lightSensor?.value === 'on';
    let brightness = 0;

    if (lightSensor && lightSensor.value !== 'off') {
      brightness = parseInt(lightSensor.value, 10);
      if (isNaN(brightness) || brightness === 0) {
        brightness = 100;
      }
    }

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, Brightness: ${brightness}`);
  }
}
