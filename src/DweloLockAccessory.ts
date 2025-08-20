import {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Sensor } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';

const POLLING_INTERVAL = 1 * 60 * 1000; // 1 minute

export class DweloLockAccessory extends StatefulAccessory<boolean> {
  private readonly lockService: Service;
  private readonly batteryService: Service;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(log, api, dweloAPI, accessory);

    this.lockService = this.accessory.getService(this.api.hap.Service.LockMechanism) || this.accessory.addService(this.api.hap.Service.LockMechanism);

    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState)
      .onGet(() => this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).value);

    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockTargetState)
      .onGet(() => {
        if (this.desiredValue !== undefined && Date.now() - this.lastUpdated < POLLING_INTERVAL) {
          return this.desiredValue ? this.api.hap.Characteristic.LockTargetState.SECURED : this.api.hap.Characteristic.LockTargetState.UNSECURED;
        }
        return this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).value;
      })
      .onSet(this.setTargetLockState.bind(this));

    this.batteryService = this.accessory.getService(this.api.hap.Service.Battery) || this.accessory.addService(this.api.hap.Service.Battery);

    this.log.info(`Dwelo Lock '${this.accessory.displayName}' created!`);
  }

  async updateState(): Promise<void> {
    const sensors = await this.dweloAPI.sensors(this.accessory.context.device.uid);
    const lockState = this.toLockState(sensors);
    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(lockState);
    this.setBatteryLevel(sensors);
    this.log.debug(`Lock state updated to: ${lockState}`);
  }

  private async setTargetLockState(value: CharacteristicValue) {
    this.desiredValue = !!value;
    this.lastUpdated = Date.now();

    this.log.info(`Setting lock to: ${value}`);
    await this.dweloAPI.toggleLock(!!value, this.accessory.context.device.uid);
    this.log.info('Lock toggle completed');
    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(value);
  }

  private toLockState(sensors: Sensor[]) {
    const lockSensor = sensors.find(s => s.sensorType === 'lock');
    if (!lockSensor) {
      return this.api.hap.Characteristic.LockCurrentState.UNKNOWN;
    }
    return lockSensor.value === 'locked'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;
  }

  private setBatteryLevel(sensors: Sensor[]) {
    const batterySensor = sensors.find(s => s.sensorType === 'battery');
    if (!batterySensor) {
      return;
    }

    const batteryLevel = parseInt(batterySensor.value, 10);
    const batteryStatus = batteryLevel > 20
      ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

    this.batteryService.getCharacteristic(this.api.hap.Characteristic.BatteryLevel).updateValue(batteryLevel);
    this.batteryService.getCharacteristic(this.api.hap.Characteristic.StatusLowBattery).updateValue(batteryStatus);

    this.log.info('Lock battery: ', batteryLevel);
  }
}
