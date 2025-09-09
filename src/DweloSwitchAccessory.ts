import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, LightAndSwitch } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

export class DweloSwitchAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    // Remove the old Switch service if it exists
    const switchService = this.accessory.getService(this.api.hap.Service.Switch);
    if (switchService) {
      this.accessory.removeService(switchService);
    }

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        const isOn = value as boolean;
        const previousValue = this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

        try {
          await this.dweloAPI.setSwitchState(isOn, this.accessory.context.device.device_id);
          this.log.debug(`Switch state change command sent: ${isOn ? 'ON' : 'OFF'}`);

        } catch (error) {
          this.log.error('Error setting switch state:', error);
          // Revert the change in HomeKit if the API call fails
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(previousValue);
        }
      });

    this.log.info(`Dwelo Switch '${this.accessory.displayName}' created!`);
  }

  async updateState(device: LightAndSwitch): Promise<void> {
    const isOn = device.sensors.Switch === 'On';
    // Status Feedback: update HomeKit with actual device state
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

    // Optionally, add StatusActive characteristic for feedback
    if (this.service.testCharacteristic && this.api.hap.Characteristic.StatusActive) {
      if (!this.service.testCharacteristic(this.api.hap.Characteristic.StatusActive)) {
        this.service.addCharacteristic(this.api.hap.Characteristic.StatusActive);
      }
      this.service.getCharacteristic(this.api.hap.Characteristic.StatusActive).updateValue(true);
    }

    this.log.debug(`Switch state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}
