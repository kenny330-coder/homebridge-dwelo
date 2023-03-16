import {
  AccessoryPlugin,
  API,
  CharacteristicValue,
  Logging,
  Service,
} from 'homebridge';

import { DweloAPI, Sensor } from './DweloAPI';

export class DweloLockAccessory implements AccessoryPlugin {
  private readonly lockService: Service;
  private readonly batteryService: Service;
  private targetState: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly dweloAPI: DweloAPI,
    public readonly name: string,
    private readonly lockID: number) {
    this.lockService = new api.hap.Service.LockMechanism(name);

    this.lockService.getCharacteristic(api.hap.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.lockService.getCharacteristic(api.hap.Characteristic.LockTargetState)
      .onGet(this.getTargetLockState.bind(this))
      .onSet(this.setTargetLockState.bind(this));

    this.batteryService = new api.hap.Service.Battery(name);
    this.batteryService.getCharacteristic(api.hap.Characteristic.BatteryLevel);
    this.batteryService.getCharacteristic(api.hap.Characteristic.StatusLowBattery);

    log.info(`Dwelo Lock '${name} ' created!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.lockService, this.batteryService];
  }

  private async getLockState() {
    const sensors = await this.dweloAPI.sensors(this.lockID);
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

    this.log.info(`Setting lock to: ${value}`);
    await this.dweloAPI.toggleLock(!!value, this.lockID);
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

    this.log.info('Lock battery: ', batterySensor?.value);
  }
}
