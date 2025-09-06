import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';



export class DweloThermostatAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Thermostat) || this.accessory.addService(this.api.hap.Service.Thermostat);

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
      })
      .onSet(async (value) => {
        try {
          const response = await this.dweloAPI.setThermostatMode(this.modeToString(value as number), this.accessory.context.device.uid);
          if (response.status === 200 || response.status === 202) {
            this.log.debug(`Thermostat mode was set to: ${this.modeToString(value as number)}`);
          } else {
            this.log.error(`Failed to set thermostat mode. Status: ${response.status}`);
          }
        } catch (error) {
          this.log.error('Error setting thermostat mode:', error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value;
      })
      .onSet(async (value) => {
        const targetTemperatureC = value as number;
        let currentTargetMode = this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
        let mode: string;

        if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.OFF) {
          this.log.info('Thermostat is off. Determining mode based on temperature.');
          const currentTemperatureC = this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value as number;
          if (targetTemperatureC > currentTemperatureC) {
            mode = 'heat';
            this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT);
          } else {
            mode = 'cool';
            this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(this.api.hap.Characteristic.TargetHeatingCoolingState.COOL);
          }
        } else {
            switch (currentTargetMode) {
              case this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT:
                mode = 'heat';
                break;
              case this.api.hap.Characteristic.TargetHeatingCoolingState.COOL:
                mode = 'cool';
                break;
              case this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO:
                mode = 'cool';
                break;
              default:
                this.log.warn(`Cannot set target temperature in current mode: ${currentTargetMode}`);
                throw new Error('Unsupported thermostat mode for setting temperature.');
            }
        }

        const targetTemperatureF = this.celsiusToFahrenheit(targetTemperatureC);
        try {
          const response = await this.dweloAPI.setThermostatTemperature(mode, targetTemperatureF, this.accessory.context.device.uid);
          if (response.status === 200 || response.status === 202) {
            this.log.debug(`Thermostat temperature was set to: ${targetTemperatureF}F for mode ${mode}`);
          } else {
            this.log.error(`Failed to set thermostat temperature. Status: ${response.status}`);
          }
        } catch (error) {
          this.log.error('Error setting thermostat temperature:', error);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).value)
      .onSet((value) => {
        this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).updateValue(value);
      });

    this.log.info(`Dwelo Thermostat '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const currentTemperatureF = parseFloat(sensors.find(s => s.sensorType === 'temperature')?.value || '0');
    const state = sensors.find(s => s.sensorType === 'state')?.value;
    const targetMode = sensors.find(s => s.sensorType === 'mode')?.value;
    const setToCoolF = parseFloat(sensors.find(s => s.sensorType === 'setToCool')?.value || '0');
    const setToHeatF = parseFloat(sensors.find(s => s.sensorType === 'setToHeat')?.value || '0');

    let currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    if (state === 'heat') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (state === 'cool') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    let targetHeatingCoolingState = this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
    if (targetMode === 'heat') {
      targetHeatingCoolingState = this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (targetMode === 'cool') {
      targetHeatingCoolingState = this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
    } else if (targetMode === 'auto') {
      targetHeatingCoolingState = this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO;
    }

    const currentTemperatureC = this.fahrenheitToCelsius(currentTemperatureF);

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(currentState);
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(currentTemperatureC);
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(targetHeatingCoolingState);

    let targetTemperatureF = 0;
    if (targetHeatingCoolingState === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
      targetTemperatureF = setToHeatF;
    } else if (targetHeatingCoolingState === this.api.hap.Characteristic.TargetHeatingCoolingState.COOL) {
      targetTemperatureF = setToCoolF;
    } else if (targetHeatingCoolingState === this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO) {
      if (setToHeatF > 0 && setToCoolF > 0) {
        targetTemperatureF = (setToHeatF + setToCoolF) / 2;
      }
    }

    if (targetHeatingCoolingState === this.api.hap.Characteristic.TargetHeatingCoolingState.OFF) {
      this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(currentTemperatureC);
    } else if (targetTemperatureF > 0) {
      const targetTemperatureC = this.fahrenheitToCelsius(targetTemperatureF);
      this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(targetTemperatureC);
    }

    this.log.debug(`Thermostat state updated to: current temperature: ${currentTemperatureF}F, target temperature: ${targetTemperatureF}F, target mode: ${targetMode}`);
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

  private fahrenheitToCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5 / 9;
  }

  private celsiusToFahrenheit(celsius: number): number {
    return Math.round((celsius * 9 / 5) + 32);
  }
}