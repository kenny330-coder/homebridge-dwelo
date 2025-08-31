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

    this.service = this.accessory.getService(this.api.hap.Service.Switch) || this.accessory.addService(this.api.hap.Service.Switch);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        await this.dweloAPI.setDimmerState(value as boolean, this.accessory.context.device.uid);
        this.log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
        setTimeout(() => this.refresh(), 2000);
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