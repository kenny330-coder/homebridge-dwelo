import {
  API,
  Logging,
  PlatformAccessory,
  Service,
  CharacteristicSetCallback,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';


export class DweloSwitchAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

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
        try {
          const response = await this.dweloAPI.setSwitchState(value as boolean, this.accessory.context.device.uid);
          if (response.status === 200 || response.status === 202) {
            this.log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(value as boolean);
          } else {
            this.log.error(`Failed to set switch state. Status: ${response.status}`);
          }
        } catch (error) {
          this.log.error('Error setting switch state:', error);
        }
      });

    this.log.info(`Dwelo Switch '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const switchSensor = sensors.find(s => s.sensorType === 'light');
    const isOn = switchSensor?.value === 'on';
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.log.debug(`Switch state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}