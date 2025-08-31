import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';



export class DweloThermostatAccessory extends StatefulAccessory {
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
      .onSet(async (value) => {
        await this.dweloAPI.setThermostatMode(this.modeToString(value as number), this.accessory.context.device.uid);
        this.log.debug(`Thermostat mode was set to: ${value}`);
        setTimeout(() => this.refresh(), 5000);
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
        await this.dweloAPI.setThermostatTemperature(mode, targetTemperatureF, this.accessory.context.device.uid);
        this.log.debug(`Thermostat temperature was set to: ${targetTemperatureF}F for mode ${mode}`);
        setTimeout(() => this.refresh(), 5000);
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
    const targetTemperatureF = parseFloat(sensors.find(s => s.sensorType === 'target_temperature')?.value || '0');
    const heatingStatus = sensors.find(s => s.sensorType === 'heating_status')?.value;
    const coolingStatus = sensors.find(s => s.sensorType === 'cooling_status')?.value;
    const targetMode = sensors.find(s => s.sensorType === 'target_mode')?.value;

    let currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    if (heatingStatus === 'on') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (coolingStatus === 'on') {
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

    if (targetTemperatureF > 0) {
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