import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';



export class DweloThermostatAccessory extends StatefulAccessory<[number, number, number]> {
  private readonly service: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Thermostat) || this.accessory.addService(this.api.hap.Service.Thermostat);

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
      })
      .onSet(async (value, callback) => {
        this.desiredValue = [value as number, this.desiredValue?.[1] || 0, this.desiredValue?.[2] || 0];
        this.lastUpdated = Date.now();
        try {
          await this.dweloAPI.setThermostatMode(this.modeToString(value as number), this.accessory.context.device.uid);
          this.log.debug(`Thermostat mode was set to: ${value}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set thermostat mode:', error);
          await this.updateState([]); // Pass empty array as sensors are fetched by platform
          callback(error as Error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value;
      })
      .onSet(async (value, callback) => {
        this.desiredValue = [this.desiredValue?.[0] || 0, value as number, this.desiredValue?.[2] || 0];
        this.lastUpdated = Date.now();
        try {
          if (this.desiredValue[0] === 1) { // Heat
            await this.dweloAPI.setThermostatTemperature('heat', value as number, this.accessory.context.device.uid);
          } else if (this.desiredValue[0] === 2) { // Cool
            await this.dweloAPI.setThermostatTemperature('cool', value as number, this.accessory.context.device.uid);
          }
          this.log.debug(`Thermostat temperature was set to: ${value}`);
          callback(null);
        } catch (error) {
          this.log.error('Failed to set thermostat temperature:', error);
          await this.updateState([]); // Pass empty array as sensors are fetched by platform
          callback(error as Error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).value)
      .onSet(value => {
        this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).updateValue(value);
      });

    this.log.info(`Dwelo Thermostat '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const currentTemperature = sensors.find(s => s.sensorType === 'temperature')?.value;
    const heatingStatus = sensors.find(s => s.sensorType === 'heating_status')?.value;
    const coolingStatus = sensors.find(s => s.sensorType === 'cooling_status')?.value;

    let currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    if (heatingStatus === 'on') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (coolingStatus === 'on') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(currentState);
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(parseFloat(currentTemperature || '0'));

    this.log.debug(`Thermostat state updated to: current temperature: ${currentTemperature}`);
  }

  private modeToString(mode: number): string {
    switch (mode) {
      case 0:
        return 'off';
      case 1:
        return 'heat';
      case 2:
        return 'cool';
      case 3:
        return 'auto';
      default:
        return 'off';
    }
  }
}
