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

    this.lockService.addCharacteristic(api.hap.Characteristic.BatteryLevel);
    this.lockService.addCharacteristic(api.hap.Characteristic.StatusLowBattery);

    log.info(`Dwelo Lock '${name} ' created!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.lockService];
  }

  private toLockState(sensors: Sensor[]) {
    const lockSensor = sensors.find(s => s.sensorType === 'lock');
    return lockSensor?.value === 'locked'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;
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
    return this.targetState;
  }

  private async setTargetLockState(value: CharacteristicValue) {
    this.targetState = value;

    this.log.info(`Lock state was set to: ${value}`);
    await this.dweloAPI.toggleLock(!!value, this.lockID);

    const sensors = await poll({
      requestFn: () => this.dweloAPI.sensors(this.lockID),
      stopCondition: s => this.toLockState(s) === value,
      interval: 1000,
      timeout: 15 * 1000,
    });

    return this.toLockState(sensors);
  }

  private setBatteryLevel(sensors: Sensor[]) {
    const batterySensor = sensors.find(s => s.sensorType === 'battery');
    this.log.info('Lock battery percentage: ', batterySensor?.value);

    if (!batterySensor) {
      return;
    }

    const batteryLevel = parseInt(batterySensor.value, 10);
    const batteryStatus = batteryLevel > 20
      ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

    this.lockService.updateCharacteristic(this.api.hap.Characteristic.BatteryLevel, batteryLevel);
    this.lockService.updateCharacteristic(this.api.hap.Characteristic.StatusLowBattery, batteryStatus);
  }
}

function poll<T>({ requestFn, stopCondition, interval, timeout }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
}): Promise<T> {
  let stop = false;

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
      setTimeout(executePoll, interval, resolve, reject);
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