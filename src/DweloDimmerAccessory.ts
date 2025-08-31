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
          let lastBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
          if (lastBrightness === 0) {
            lastBrightness = 100; // Default to 100 if last brightness was 0
          }
          this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(lastBrightness);
          await this.dweloAPI.setDimmerBrightness(lastBrightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer state was set to: ON with brightness ${lastBrightness}`);
        } else { // Turning Off
          await this.dweloAPI.setDimmerState(false, this.accessory.context.device.uid);
          this.log.debug('Dimmer state was set to: OFF');
        }
        setTimeout(() => this.refresh(), 5000);
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        // Return the last known brightness value
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
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
        } else {
          await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer brightness was set to: ${brightness}`);
        }
        setTimeout(() => this.refresh(), 5000);
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const lightSensor = sensors.find(s => s.sensorType === 'light');
    const isOn = lightSensor?.value === 'on';

    // We only get on/off state from the API, not the brightness.
    // So, we only update the On characteristic.
    // The brightness will be preserved at its last known value in HomeKit.
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}
