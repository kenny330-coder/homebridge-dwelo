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
    } catch (error) {
      this.log.error('Error setting lock state:', error);
      // Revert on error
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(previousCurrentState);
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockTargetState).updateValue(previousCurrentState);
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

    this.log.info('Lock battery: ', batteryLevel);
  }
}
