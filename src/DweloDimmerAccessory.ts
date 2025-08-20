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
      .onSet(async (value, callback) => {
        try {
          // When turning on, use a default brightness (e.g., 99) if no previous desired brightness is available
          const brightness = value as boolean ? 99 : 0;
          await this.dweloAPI.setDimmerState(brightness, this.accessory.context.device.uid);
          this.log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer state:', error);
          await this.updateState([]);
          callback(error as Error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
      })
      .onSet(async (value, callback) => {
        try {
          await this.dweloAPI.setDimmerState(value as number, this.accessory.context.device.uid);
          this.log.debug(`Dimmer brightness was set to: ${value}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set dimmer brightness:', error);
          await this.updateState([]);
          callback(error as Error);
        }
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const isOn = sensors.find(s => s.sensorType === 'light')?.value === 'on';
    const brightness = sensors.find(s => s.sensorType === 'Dimmer')?.value;

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(parseInt(brightness || '0', 10));

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, brightness: ${brightness}`);
  }
}
