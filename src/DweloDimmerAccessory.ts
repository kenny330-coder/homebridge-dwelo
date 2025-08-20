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
      .onSet(async (value) => {
        const brightness = value as boolean ? 99 : 0;
        await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
        this.log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        // Return the current brightness. For now, we'll assume 100 if on, 0 if off.
        // In a real scenario, you'd want to fetch the actual brightness from the device.
        const isOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;
        return isOn ? 100 : 0;
      })
      .onSet(async (value) => {
        const brightness = value as number;
        await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
        this.log.debug(`Dimmer brightness was set to: ${brightness}`);
      });

    

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const lightSensor = sensors.find(s => s.sensorType === 'light');
    const isOn = lightSensor?.value === 'on';
    let brightness = 0;

    if (lightSensor && lightSensor.value !== 'off') {
      // Assuming the light sensor value can also be a number for brightness
      // or that 'on' implies full brightness if no specific value is given.
      brightness = parseInt(lightSensor.value, 10);
      if (isNaN(brightness) || brightness === 0) {
        brightness = 100; // Default to 100 if 'on' but no specific brightness value
      }
    }

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, Brightness: ${brightness}`);
  }
}
