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
  private onCommandTimeout: NodeJS.Timeout | null = null;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.On).value)
      .onSet(async (value) => {
        const isOn = value as boolean;
        const previousOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;

        // Optimistically update the state in HomeKit
        this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

        // Clear any pending "On" command timeout, as a new command (On or Off) is coming in.
        if (this.onCommandTimeout) {
          clearTimeout(this.onCommandTimeout);
          this.onCommandTimeout = null;
        }

        if (isOn && previousOn) {
          // This is a redundant "On" command for a light that's already on.
          // This can happen when adjusting brightness. We just log it and do nothing else.
          this.log.debug('Received redundant "On" command while light is already on. Ignoring.');
          this.onCommandTimeout = null;
        }

        if (isOn) {
          // This is an "On" command. It might be followed by a brightness command from HomeKit.
          // We set a short timeout. If a brightness command arrives, it will cancel this.
          // If not, we'll proceed to turn the light on to its last known brightness.
          this.onCommandTimeout = setTimeout(async () => {
            this.log.debug('Handling debounced "On" command. Setting to last known brightness.');
            try {
              // This command implicitly turns the light on.
              await this.dweloAPI.setDimmerBrightness(this.lastKnownBrightness, this.accessory.context.device.device_id);
              // Also update the brightness characteristic in HomeKit.
              this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(this.lastKnownBrightness);
              this.log.debug(`Dimmer state was set to: ON with last known brightness ${this.lastKnownBrightness}`);
            } catch (error) {
              this.log.error('Error setting dimmer state (from delayed On):', error);
              // Revert the optimistic update if the API call fails.
              this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
            }
          }, 150); // 150ms is a safe debounce delay for HomeKit.
        } else { // Turning Off
          try {
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            this.log.debug('Dimmer state was set to: OFF');
          } catch (error) {
            this.log.error('Error setting dimmer state to OFF:', error);
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
          }
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value)
      .onSet(async (value) => {
        // A brightness command is the source of truth. Cancel any debounced "On" command.
        if (this.onCommandTimeout) {
          clearTimeout(this.onCommandTimeout);
          this.onCommandTimeout = null;
          this.log.debug('Brightness command received, cancelling separate "On" command.');
        }

        const brightness = value as number;
        const previousBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
        const previousOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value as boolean;

        // Optimistically update HomeKit
        this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

        try {
          if (brightness === 0) {
            // Setting brightness to 0 is equivalent to turning the light off.
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer set to OFF (brightness 0)`);
          } else {
            // When brightness is set to a non-zero value, store it and ensure the light is on.
            this.lastKnownBrightness = brightness;
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            // This command implicitly turns the light on.
            await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.device_id);
            this.log.debug(`Dimmer brightness was set to: ${brightness}`);
          }
        } catch (error) {
          this.log.error('Error setting dimmer brightness:', error);
          // Revert optimistic updates on error
          this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(previousBrightness);
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousOn);
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
