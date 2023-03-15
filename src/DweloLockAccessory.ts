import {
  AccessoryPlugin,
  API,
  CharacteristicValue,
  Logging,
  Service,
} from 'homebridge';

import { DweloAPI } from './DweloAPI';

export class DweloLockAccessory implements AccessoryPlugin {
  private readonly lockService: Service;

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly dweloAPI: DweloAPI,
    public readonly name: string,
    private readonly lockID: number) {
    this.lockService = new api.hap.Service.LockManagement(name);

    this.lockService.getCharacteristic(api.hap.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.lockService.getCharacteristic(api.hap.Characteristic.LockTargetState)
      .onGet(this.getLockState.bind(this))
      .onSet(this.setLockState.bind(this));

    this.lockService.addOptionalCharacteristic(api.hap.Characteristic.StatusLowBattery);
    this.lockService.getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(this.getBatteryStatus.bind(this));

    log.info(`Dwelo Lock '${name} ' created!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.lockService];
  }

  private async getLockState() {
    const sensors = await this.dweloAPI.sensors(this.lockID);
    const lockSensor = sensors.find(s => s.sensorType === 'lock');
    const state = lockSensor?.value === 'locked'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;
    this.log.debug(`Current state of the lock was returned: ${state}`);
    return state;
  }

  private async setLockState(value: CharacteristicValue) {
    await this.dweloAPI.toggleLock(!!value, this.lockID);
    this.log.debug(`Lock state was set to: ${value}`);
  }

  private async getBatteryStatus() {
    const sensors = await this.dweloAPI.sensors(this.lockID);
    const batterySensor = sensors.find(s => s.sensorType === 'battery');
    this.log.debug('Lock battery percentage: ', batterySensor?.value);
    if (!batterySensor) {
      return null;
    }
    return parseInt(batterySensor.value, 10) > 20
      ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
  }
}