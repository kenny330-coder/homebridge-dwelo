import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Thermostat } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

// Poll function copied from DweloAPI.ts
function poll<T>({ requestFn, stopCondition, interval, timeout }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
}): Promise<T> {
  let stop = false;
  let attempt = 1;

  const executePoll = async (resolve: (r: T) => unknown, reject: (e: Error) => void) => {
    const result = await requestFn();

    let stopConditionalResult: boolean;
    try {
      stopConditionalResult = stopCondition(result);
    } catch (e) {
      reject(e as Error);
      return;
    }

    if (stopConditionalResult) {
      resolve(result);
    } else if (stop) {
      reject(new Error('timeout'));
    } else {
      setTimeout(executePoll, interval * Math.pow(2, attempt++), resolve, reject);
    }
  };

  const pollResult = new Promise<T>(executePoll);
  const maxTimeout = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Exceeded max timeout'));
      stop = true;
    }, timeout);
  });

  return Promise.race([pollResult, maxTimeout]);
}


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
        try {
          await this.dweloAPI.setThermostatMode(mode, this.accessory.context.device.device_id);
          await poll({
            requestFn: () => this.platform.getRefreshedStatusData(),
            stopCondition: (status) => {
              const device = status.THERMOSTATS.find(d => d.device_id === this.accessory.context.device.device_id);
              return device?.sensors.ThermostatMode.toLowerCase() === mode.toLowerCase();
            },
            interval: 2000,
            timeout: 20000,
          });
          this.log.debug(`Thermostat mode was set to: ${mode}`);
        } catch (error) {
          this.log.error('Error setting thermostat mode:', error);
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

        try {
          await this.dweloAPI.setThermostatTemperature(mode, targetTemperatureF, this.accessory.context.device.device_id);
          await poll({
            requestFn: () => this.platform.getRefreshedStatusData(),
            stopCondition: (status) => {
              const device = status.THERMOSTATS.find(d => d.device_id === this.accessory.context.device.device_id);
              if (!device) return false;
              if (mode === 'heat') {
                return device.sensors.ThermostatHeatSetpoint.value === targetTemperatureF;
              } else { // cool
                return device.sensors.ThermostatCoolSetpoint.value === targetTemperatureF;
              }
            },
            interval: 2000,
            timeout: 20000,
          });
          this.log.debug(`Thermostat temperature was set to: ${targetTemperatureF}F for mode ${mode}`);
        } catch (error) {
          this.log.error('Error setting thermostat temperature:', error);
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
