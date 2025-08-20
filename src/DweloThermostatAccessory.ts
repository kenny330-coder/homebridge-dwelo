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
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .onGet(() => {
        return this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value;
      })
      .onSet(async (value) => {
        // Use the current target heating/cooling state to determine the mode for setting temperature
        const currentTargetMode = this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
        let mode: string;
        switch (currentTargetMode) {
          case this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT:
            mode = 'heat';
            break;
          case this.api.hap.Characteristic.TargetHeatingCoolingState.COOL:
            mode = 'cool';
            break;
          case this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO:
            // For auto, we might need to decide between heat/cool based on current temp vs target
            // For simplicity, let's default to 'cool' if setting a target temperature in auto mode.
            mode = 'cool';
            break;
          default:
            this.log.warn('Cannot set target temperature when thermostat is off or in an unsupported mode.');
            throw new Error('Unsupported thermostat mode for setting temperature.'); // Throw error instead of callback
        }
        await this.dweloAPI.setThermostatTemperature(mode, value as number, this.accessory.context.device.uid);
        this.log.debug(`Thermostat temperature was set to: ${value}`);
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).value)
      .onSet((value) => {
        this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).updateValue(value);
      });

    this.log.info(`Dwelo Thermostat '${this.accessory.displayName}' created!`);
  }

  async updateState(sensors: Sensor[]): Promise<void> {
    const currentTemperature = sensors.find(s => s.sensorType === 'temperature')?.value;
    const heatingStatus = sensors.find(s => s.sensorType === 'heating_status')?.value;
    const coolingStatus = sensors.find(s => s.sensorType === 'cooling_status')?.value;
    const targetTemperature = sensors.find(s => s.sensorType === 'target_temperature')?.value;
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

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(currentState);
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(parseFloat(currentTemperature || '0'));
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(targetHeatingCoolingState);
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(parseFloat(targetTemperature || '0'));

    this.log.debug(`Thermostat state updated to: current temperature: ${currentTemperature}, target temperature: ${targetTemperature}, target mode: ${targetMode}`);
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
