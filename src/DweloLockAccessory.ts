import {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { CachedRequest } from './CachedRequest';

import { DweloAPI, Sensor } from './DweloAPI';

export class DweloLockAccessory {
  private readonly lockService: Service;
  private readonly batteryService: Service;
  private targetState: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  private sensorCache: CachedRequest<Sensor[]>;

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly dweloAPI: DweloAPI,
    private readonly accessory: PlatformAccessory) {

    const lockID = accessory.context.device.uid;
    this.sensorCache = new CachedRequest(1000, () => this.dweloAPI.sensors(lockID));

    this.lockService = this.accessory.getService(this.api.hap.Service.LockMechanism) || this.accessory.addService(this.api.hap.Service.LockMechanism);

    this.lockService.getCharacteristic(api.hap.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.lockService.getCharacteristic(api.hap.Characteristic.LockTargetState)
      .onGet(this.getTargetLockState.bind(this))
      .onSet(this.setTargetLockState.bind(this));

    this.batteryService = this.accessory.getService(this.api.hap.Service.Battery) || this.accessory.addService(this.api.hap.Service.Battery);

    log.info(`Dwelo Lock '${this.accessory.displayName}' created!`);
  }

  private async getLockState() {
    const sensors = await this.sensorCache.get();
    const state = this.toLockState(sensors);
    this.setBatteryLevel(sensors);
    this.log.info(`Current state of the lock was returned: ${state}`);
    return state;
  }

  private async getTargetLockState() {
    this.log.info(`Current target lock state was: ${this.targetState}`);
    return this.targetState || (await this.getLockState());
  }

  private async setTargetLockState(value: CharacteristicValue) {
    this.targetState = value;
    this.sensorCache.clear();

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
