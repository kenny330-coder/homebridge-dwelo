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
  private turnOnTimer: NodeJS.Timeout | null = null;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.On).value)
      .onSet(async (value) => {
        const isOn = value as boolean;
        const previousOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;
        this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

        if (this.turnOnTimer) {
          clearTimeout(this.turnOnTimer);
          this.turnOnTimer = null;
        }

        if (isOn) {
          // If the light is turned on, we wait a moment to see if a brightness command is also sent.
          // This prevents the light from flashing to the last brightness level before adjusting to the new one.
          this.turnOnTimer = setTimeout(async () => {
            this.log.debug(`(Delayed) Turning ON dimmer to last known brightness: ${this.lastKnownBrightness}%`);
            try {
              await this.dweloAPI.setDimmerBrightness(this.lastKnownBrightness, this.accessory.context.device.device_id);
              this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(this.lastKnownBrightness);
            } catch (error) {
              this.log.error('Error setting dimmer state (delayed):', error);
              this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            }
          }, 100);
        } else {
          // When turning off, send the 'off' command immediately.
          try {
            this.log.debug('Turning OFF dimmer.');
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
          } catch (error) {
            this.log.error('Error setting dimmer state:', error);
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
          }
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value)
      .onSet(async (value) => {
        const brightness = value as number;
        const previousBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
        const previousOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;

        // If a delayed 'on' command is pending, cancel it. This brightness command will handle turning on the light.
        if (this.turnOnTimer) {
          clearTimeout(this.turnOnTimer);
          this.turnOnTimer = null;
        }

        // Optimistically update HomeKit
        this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

        try {
          if (brightness === 0) {
            // Setting brightness to 0 is equivalent to turning the light off.
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer set to OFF (brightness 0)`);
          } else if (brightness === 100) {
            // When brightness is set to 100%, send the 'on' command, which Dwelo treats as 100%.
            this.lastKnownBrightness = 100;
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            await this.dweloAPI.setSwitchState, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer brightness was set to 100% by sending 'on' command.`);
          } else {
            // When brightness is set to a non-zero value, store it and ensure the light is on.
            this.lastKnownBrightness = brightness;
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer brightness was set to: ${brightness}`);
          }
        } catch (error) {
          this.log.error('Error setting dimmer brightness. The command may have still gone through.', error);
          // Do not revert the state on timeout, as the command may have succeeded.
          // The state will be corrected by the next polling update if it failed.
          if (!(error instanceof Error && error.message.includes('Polling timed out'))) {
            // Revert optimistic updates only for immediate errors, not timeouts.
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(previousBrightness);
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
          }
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
