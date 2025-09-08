import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Thermostat } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

import { poll } from './util';


export class DweloThermostatAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Thermostat) || this.accessory.addService(this.api.hap.Service.Thermostat);

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).value;
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
      })
      .onSet(async (value) => {
        const mode = this.modeToString(value as number);
        const previousState = this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(value);
        try {
          await this.dweloAPI.setThermostatMode(mode, this.accessory.context.device.device_id);
          this.log.debug(`Thermostat mode was set to: ${mode}`);
        } catch (error) {
          this.log.error('Error setting thermostat mode:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(previousState);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value;
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value;
      })
      .onSet(async (value) => {
        const targetTemperatureC = value as number;
        const targetTemperatureF = this.celsiusToFahrenheit(targetTemperatureC);
        
        const currentTargetMode = this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
        let mode: string;

        if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
          mode = 'heat';
        } else if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.COOL) {
          mode = 'cool';
        } else {
            this.log.warn(`Cannot set target temperature in current mode: ${currentTargetMode}`);
            return;
        }

        const previousTemperature = this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(value);

        try {
          await this.dweloAPI.setThermostatTemperature(mode, targetTemperatureF, this.accessory.context.device.device_id);
          this.log.debug(`Thermostat temperature was set to: ${targetTemperatureF}F for mode ${mode}`);
        } catch (error) {
          this.log.error('Error setting thermostat temperature:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(previousTemperature);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.api.hap.Characteristic.TemperatureDisplayUnits.CELSIUS)
      .onSet(() => {});

    this.log.info(`Dwelo Thermostat '${this.accessory.displayName}' created!`);
  }

  async updateState(device: Thermostat): Promise<void> {
    const {
      Temperature,
      ThermostatMode,
      ThermostatOperatingState,
      ThermostatCoolSetpoint,
      ThermostatHeatSetpoint,
    } = device.sensors;

    // Current State
    let currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    if (ThermostatOperatingState.toLowerCase() === 'heat') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (ThermostatOperatingState.toLowerCase() === 'cool') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(currentState);

    // Target State
    let targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
    if (ThermostatMode.toLowerCase() === 'heat') {
      targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (ThermostatMode.toLowerCase() === 'cool') {
      targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
    } else if (ThermostatMode.toLowerCase() === 'auto') {
        targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO;
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(targetState);

    // Current Temperature
    const currentTemperatureC = this.fahrenheitToCelsius(Temperature.value);
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(currentTemperatureC);

    // Target Temperature
    if (targetState === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
        const targetTemperatureC = this.fahrenheitToCelsius(ThermostatHeatSetpoint.value);
        this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(targetTemperatureC);
    } else if (targetState === this.api.hap.Characteristic.TargetHeatingCoolingState.COOL) {
        const targetTemperatureC = this.fahrenheitToCelsius(ThermostatCoolSetpoint.value);
        this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(targetTemperatureC);
    }

    this.log.debug(`Thermostat state updated for ${this.accessory.displayName}`);
  }

  private modeToString(mode: number): string {
    switch (mode) {
      case this.api.hap.Characteristic.TargetHeatingCoolingState.OFF:
        return 'off';
      case this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT:
        return 'heat';
      case this.api.hap.Characteristic.TargetHeatingCoolingState.COOL:
        return 'cool';
      case this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO:
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
