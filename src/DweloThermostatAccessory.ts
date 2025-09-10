import {
  API,
  Logging,
  PlatformAccessory,
  Service,
  CharacteristicGetHandler,
  CharacteristicSetHandler,
} from 'homebridge';
import { DweloAPI, Thermostat } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

export class DweloThermostatAccessory extends StatefulAccessory {
  private readonly service: Service;
  private fanService: Service;
  private humidityService: Service;
  private fanModes: string[];

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Thermostat) || this.accessory.addService(this.api.hap.Service.Thermostat);

    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value)
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
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value);

    this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).value)
      .onSet(async (value) => {
        const targetTemperatureC = value as number;
        const targetTemperatureF = this.celsiusToFahrenheit(targetTemperatureC);
        
        const currentTargetMode = this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).value;
        const currentTemperature = this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).value as number;
        let mode: string;

        if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
          mode = 'heat';
        } else if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.COOL) {
          mode = 'cool';
        } else if (currentTargetMode === this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO) {
          // In Auto mode, decide whether to adjust the heat or cool setpoint
          if (targetTemperatureC > currentTemperature) {
            mode = 'cool'; // User is raising temp, adjust the upper bound
          } else {
            mode = 'heat'; // User is lowering temp, adjust the lower bound
          }
        } else {
          // In OFF mode or other modes, do nothing.
          this.log.warn(`Cannot set target temperature when thermostat is not in HEAT, COOL, or AUTO mode. Current mode: ${currentTargetMode}`);
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

    this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).value)
      .onSet(async (value) => {
        const targetTemperatureC = value as number;
        const targetTemperatureF = this.celsiusToFahrenheit(targetTemperatureC);
        const previousTemperature = this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).updateValue(value);
        try {
          await this.dweloAPI.setThermostatTemperature('heat', targetTemperatureF, this.accessory.context.device.device_id);
          this.log.debug(`Thermostat heating threshold set to: ${targetTemperatureF}F`);
        } catch (error) {
          this.log.error('Error setting thermostat heating threshold:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).updateValue(previousTemperature);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).value)
      .onSet(async (value) => {
        const targetTemperatureC = value as number;
        const targetTemperatureF = this.celsiusToFahrenheit(targetTemperatureC);
        const previousTemperature = this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).value;
        this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).updateValue(value);
        try {
          await this.dweloAPI.setThermostatTemperature('cool', targetTemperatureF, this.accessory.context.device.device_id);
          this.log.debug(`Thermostat cooling threshold set to: ${targetTemperatureF}F`);
        } catch (error) {
          this.log.error('Error setting thermostat cooling threshold:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).updateValue(previousTemperature);
        }
      });

    // Dynamically set supported TargetHeatingCoolingState values from hvac_modes
    const hvacModes = accessory.context.device?.device_metadata?.hvac_modes || ['Off', 'Heat', 'Cool', 'Auto'];
    const supportedModes = hvacModes.map((mode: string) => {
      switch (mode.toLowerCase()) {
        case 'off': return this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
        case 'heat': return this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
        case 'cool': return this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
        case 'auto': return this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO;
        default: return null;
      }
    }).filter((m: number|null) => m !== null);
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: supportedModes });

    // Set temperature range from metadata
    const { heat_setpoint_low, heat_setpoint_high, cool_setpoint_low, cool_setpoint_high } = accessory.context.device?.device_metadata || {};
    const minHeatC = this.fahrenheitToCelsius(heat_setpoint_low || 40);
    const maxHeatC = this.fahrenheitToCelsius(heat_setpoint_high || 89);
    const minCoolC = this.fahrenheitToCelsius(cool_setpoint_low || 61);
    const maxCoolC = this.fahrenheitToCelsius(cool_setpoint_high || 90);

    this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).setProps({ minValue: minHeatC, maxValue: maxHeatC, minStep: 0.5 });
    this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).setProps({ minValue: minCoolC, maxValue: maxCoolC, minStep: 0.5 });


    // Add Fan Mode as a HomeKit Fan service, using supported fan_modes
    this.fanModes = accessory.context.device?.device_metadata?.fan_modes || ['AutoLow', 'ManualLow'];
    this.fanService = this.accessory.getService(this.api.hap.Service.Fan) || this.accessory.addService(this.api.hap.Service.Fan, 'Thermostat Fan');
    this.fanService.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => this.fanService.getCharacteristic(this.api.hap.Characteristic.On).value)
      .onSet(async (value) => {
        const isOn = value as boolean;
        // Based on examples: ON is 'ManualLow' (second mode), OFF is 'AutoLow' (first mode)
        const fanMode = isOn ? (this.fanModes[1] || 'ManualLow') : (this.fanModes[0] || 'AutoLow');
        try {
          await this.dweloAPI.setThermostatFanMode(fanMode, this.accessory.context.device.device_id);
          this.log.debug(`Thermostat fan mode set to: ${fanMode}`);
        } catch (error) {
          this.log.error('Error setting fan mode:', error);
        }
      });

    // Add Humidity Sensor
    this.humidityService = this.accessory.getService(this.api.hap.Service.HumiditySensor) || this.accessory.addService(this.api.hap.Service.HumiditySensor);

    // TemperatureDisplayUnits: respect device unit
    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).value)
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
      ThermostatFanMode,
      Humidity,
    } = device.sensors;

    // Current State
    let currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    if (ThermostatOperatingState && ThermostatOperatingState.toLowerCase() === 'heat') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (ThermostatOperatingState && ThermostatOperatingState.toLowerCase() === 'cool') {
      currentState = this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(currentState);

    // Target State
    let targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
    if (ThermostatMode && ThermostatMode.toLowerCase() === 'heat') {
      targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (ThermostatMode && ThermostatMode.toLowerCase() === 'cool') {
      targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
    } else if (ThermostatMode && ThermostatMode.toLowerCase() === 'auto') {
      targetState = this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO;
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(targetState);

    // Current Temperature
    let currentTemperature = Temperature.value;
    if (Temperature.unit === 'F') {
      currentTemperature = this.fahrenheitToCelsius(Temperature.value);
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(currentTemperature);

    // Target Temperature
    if (targetState === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT) {
      let targetTemperature = ThermostatHeatSetpoint.value;
      if (ThermostatHeatSetpoint.unit === 'F') {
        targetTemperature = this.fahrenheitToCelsius(ThermostatHeatSetpoint.value);
      }
      this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(targetTemperature);
    } else if (targetState === this.api.hap.Characteristic.TargetHeatingCoolingState.COOL) {
      let targetTemperature = ThermostatCoolSetpoint.value;
      if (ThermostatCoolSetpoint.unit === 'F') {
        targetTemperature = this.fahrenheitToCelsius(ThermostatCoolSetpoint.value);
      }
      this.service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(targetTemperature);
    }

    // Heating and Cooling Thresholds for Auto mode
    let heatThreshold = ThermostatHeatSetpoint.value;
    if (ThermostatHeatSetpoint.unit === 'F') {
      heatThreshold = this.fahrenheitToCelsius(ThermostatHeatSetpoint.value);
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).updateValue(heatThreshold);

    let coolThreshold = ThermostatCoolSetpoint.value;
    if (ThermostatCoolSetpoint.unit === 'F') {
      coolThreshold = this.fahrenheitToCelsius(ThermostatCoolSetpoint.value);
    }
    this.service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).updateValue(coolThreshold);


    // Fan Mode
    if (this.fanService) {
      // Based on examples: ON is 'ManualLow' (second mode), OFF is 'AutoLow' (first mode)
      this.fanService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(
        ThermostatFanMode === (this.fanModes[1] || 'ManualLow')
      );
    }

    // Humidity
    if (this.humidityService) {
      this.humidityService.getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity).updateValue(Humidity);
    }

    // Temperature Display Unit
    const unit = Temperature.unit || 'F';
    const displayUnit = unit === 'C' ? this.api.hap.Characteristic.TemperatureDisplayUnits.CELSIUS : this.api.hap.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    this.service.getCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits).updateValue(displayUnit);

    // Save device context for .onGet/.onSet
    this.accessory.context.device = device;

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
