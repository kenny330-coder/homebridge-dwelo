import {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, Lock } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

export class DweloLockAccessory extends StatefulAccessory {
  private readonly lockService: Service;
  private readonly batteryService: Service;
  private autoLockTimer: NodeJS.Timeout | null = null;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.lockService = this.accessory.getService(this.api.hap.Service.LockMechanism) || this.accessory.addService(this.api.hap.Service.LockMechanism);

    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState)
      .onGet(() => this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).value);

    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockTargetState)
      .onGet(() => {
        return this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).value;
      })
      .onSet(this.setTargetLockState.bind(this));

    this.batteryService = this.accessory.getService(this.api.hap.Service.Battery) || this.accessory.addService(this.api.hap.Service.Battery);

    this.log.info(`Dwelo Lock '${this.accessory.displayName}' created!`);
  }

  async updateState(device: Lock): Promise<void> {
    const lockState = this.toLockState(device.sensors.DoorLocked);
    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(lockState);
    this.setBatteryLevel(device.sensors.BatteryLevel);
    this.log.debug(`Lock state updated to: ${lockState}`);

    if (this.platform.config.autoLock?.enabled) {
      if (lockState === this.api.hap.Characteristic.LockCurrentState.UNSECURED) {
        this.scheduleAutoLock(this.platform.config.autoLock.unlockedDuration);
      } else {
        this.clearAutoLockTimer();
      }
    }
  }

  private async setTargetLockState(value: CharacteristicValue) {
    this.log.info(`Setting lock to: ${value}`);
    const targetState = value as number;
    const previousCurrentState = this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).value;

    // Set the target state. HomeKit will show "Locking..." or "Unlocking..."
    // because the current state doesn't match the target state yet.
    this.lockService.getCharacteristic(this.api.hap.Characteristic.LockTargetState).updateValue(targetState);

    try {
      await this.dweloAPI.setLockState(targetState === this.api.hap.Characteristic.LockTargetState.SECURED, this.accessory.context.device.device_id);
      // Once the API call is successful (including polling), update the current state.
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(targetState);
      this.log.info('Lock toggle completed');

      if (this.platform.config.autoLock?.enabled) {
        if (targetState === this.api.hap.Characteristic.LockTargetState.UNSECURED) {
          this.scheduleAutoLock(this.platform.config.autoLock.homekitUnlockedDuration);
        } else {
          this.clearAutoLockTimer();
        }
      }
    } catch (error) {
      this.log.error('Error setting lock state:', error);
      // Revert on error
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(previousCurrentState);
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockTargetState).updateValue(previousCurrentState);
    }
  }

  private scheduleAutoLock(delayInMinutes: number) {
    this.clearAutoLockTimer();
    if (delayInMinutes > 0) {
      const delayInMs = delayInMinutes * 60 * 1000;
      this.log.info(`Scheduling auto-lock for '${this.accessory.displayName}' in ${delayInMinutes} minutes.`);
      this.autoLockTimer = setTimeout(() => {
        this.log.info(`Auto-locking '${this.accessory.displayName}'.`);
        this.setTargetLockState(this.api.hap.Characteristic.LockTargetState.SECURED);
      }, delayInMs);
    }
  }

  private clearAutoLockTimer() {
    if (this.autoLockTimer) {
      this.log.info(`Clearing auto-lock timer for '${this.accessory.displayName}'.`);
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  private toLockState(doorLocked: string) {
    if (!doorLocked) {
      return this.api.hap.Characteristic.LockCurrentState.UNKNOWN;
    }
    return doorLocked.toLowerCase() === 'true'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;
  }

  private setBatteryLevel(batteryLevel: number) {
    if (batteryLevel === undefined) {
      return;
    }

    const batteryStatus = batteryLevel > 20
      ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

    this.batteryService.getCharacteristic(this.api.hap.Characteristic.BatteryLevel).updateValue(batteryLevel);
    this.batteryService.getCharacteristic(this.api.hap.Characteristic.StatusLowBattery).updateValue(batteryStatus);
  }
}
