import { API, DynamicPlatformPlugin, PlatformConfig, AccessoryPlugin, Logging, PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import { DweloAPI } from './DweloAPI';
import { DweloLockAccessory } from './DweloLockAccessory';
import { DweloSwitchAccessory } from './DweloSwitchAccessory';
import { DweloDimmerAccessory } from './DweloDimmerAccessory';

export class HomebridgePluginDweloPlatform implements DynamicPlatformPlugin {
  private readonly dweloAPI: DweloAPI;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.dweloAPI = new DweloAPI(config.token, config.gatewayId);

    this.log.debug(`Finished initializing platform: ${this.config.name}`);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.dweloAPI.devices().then(devices => {
      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.uid.toString());
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          this.createAccessory(existingAccessory.displayName, device.uid, device.deviceType);
        } else {
          this.log.info('Adding new accessory:', device.givenName);
          const accessory = new this.api.platformAccessory(device.givenName, uuid);
          accessory.context.device = device;
          this.createAccessory(accessory.displayName, device.uid, device.deviceType);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    });
  }

  createAccessory(name: string, uid: number, deviceType: string) {
    switch (deviceType) {
      case 'switch':
        new DweloSwitchAccessory(this.log, this.api, this.dweloAPI, name, uid);
        break;
      case 'lock':
        new DweloLockAccessory(this.log, this.api, this.dweloAPI, name, uid);
        break;
      case 'dimmer':
        new DweloDimmerAccessory(this.log, this.api, this.dweloAPI, name, uid);
        break;
      default:
        this.log.warn(`Support for Dwelo accessory type: ${deviceType} is not implemented`);
        break;
    }
  }
}
