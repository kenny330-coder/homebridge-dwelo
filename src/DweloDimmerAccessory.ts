import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, LightAndSwitch } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';


export class DweloDimmerAccessory extends StatefulAccessory {
  private readonly service: Service;
  private lastKnownBrightness = 100;

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
          if (isOn) {
            // When turning on, restore to the last known brightness level.
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(this.lastKnownBrightness);
            await this.dweloAPI.setDimmerBrightness(this.lastKnownBrightness, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer state was set to: ON with last known brightness ${this.lastKnownBrightness}`);
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
            // When brightness is set to a non-zero value, store it.
            this.lastKnownBrightness = brightness;
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

    // Update last known brightness if the light is on and has a non-zero brightness value.
    if (isOn && brightness > 0) {
      this.lastKnownBrightness = brightness;
    }

    // Status Feedback: update HomeKit with actual device state
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

    // Optionally, add StatusActive characteristic for feedback
    if (this.service.testCharacteristic && this.api.hap.Characteristic.StatusActive) {
      if (!this.service.testCharacteristic(this.api.hap.Characteristic.StatusActive)) {
        this.service.addCharacteristic(this.api.hap.Characteristic.StatusActive);
      }
      this.service.getCharacteristic(this.api.hap.Characteristic.StatusActive).updateValue(true);
    }

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, Brightness: ${brightness}`);
  }
}
