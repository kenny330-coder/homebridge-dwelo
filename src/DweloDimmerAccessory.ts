import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, LightAndSwitch } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

import { poll } from './util';


export class DweloDimmerAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        const isOn = value as boolean;
        const previousOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

        try {
          if (isOn) { // Turning On
            let lastBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
            if (lastBrightness === 0) {
              lastBrightness = 100; // Default to 100 if last brightness was 0
            }
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(lastBrightness);
            await this.dweloAPI.setDimmerBrightness(lastBrightness, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer state was set to: ON with brightness ${lastBrightness}`);
          } else { // Turning Off
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            this.log.debug('Dimmer state was set to: OFF');
          }
          } catch (error) {
          this.log.error('Error setting dimmer state:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
      })
      .onSet(async (value) => {
        const brightness = value as number;
        const previousBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
        this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

        try {
          if (brightness === 0) {
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer set to OFF (brightness 0)`);
          } else {
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer brightness was set to: ${brightness}`);
          }
          } catch (error) {
          this.log.error('Error setting dimmer brightness:', error);
          // Revert on error
          this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(previousBrightness);
        }
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(device: LightAndSwitch): Promise<void> {
    const isOn = device.sensors.Switch === 'On';
    const brightness = device.sensors.Percent || 0;

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, Brightness: ${brightness}`);
  }
}
