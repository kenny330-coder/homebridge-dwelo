import { API, DynamicPlatformPlugin, PlatformConfig, Logging, PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { version } from '../package.json';

import { DweloAPI, RefreshedStatus, LightAndSwitch, Lock, Thermostat } from './DweloAPI';
import { DweloLockAccessory } from './DweloLockAccessory';
import { DweloSwitchAccessory } from './DweloSwitchAccessory';
import { DweloDimmerAccessory } from './DweloDimmerAccessory';
import { DweloThermostatAccessory } from './DweloThermostatAccessory';
import { StatefulAccessory } from './StatefulAccessory';

const POLLING_INTERVAL = 30 * 1000; // 30 seconds

export class HomebridgePluginDweloPlatform implements DynamicPlatformPlugin {
  private readonly dweloAPI: DweloAPI;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly accessoryHandlers: StatefulAccessory[] = [];
  private lastRefreshedStatusTime = 0;
  private refreshedStatus: RefreshedStatus | null = null;
  private refreshedStatusPromise: Promise<RefreshedStatus> | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.dweloAPI = new DweloAPI(config.token, config.gatewayId);

    this.log.info(`Dwelo Plugin Version: ${version}`);
    this.log.debug(`Finished initializing platform: ${this.config.name}`);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      setInterval(() => this.updateAllAccessories(), POLLING_INTERVAL);
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.dweloAPI.getRefreshedStatus().then(status => {
      const devices = [
        ...status['LIGHTS AND SWITCHES'],
        ...status.LOCKS,
        ...status.THERMOSTATS,
      ];

      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.device_id.toString());
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = device;
          this.createAccessory(existingAccessory);
        } else {
          this.log.info('Adding new accessory:', device.name);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          this.createAccessory(accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    });
  }

  createAccessory(accessory: PlatformAccessory) {
    let accessoryHandler;
    switch (accessory.context.device.device_type) {
      case 'switch':
        accessoryHandler = new DweloSwitchAccessory(this, this.log, this.api, this.dweloAPI, accessory);
        break;
      case 'lock':
        accessoryHandler = new DweloLockAccessory(this, this.log, this.api, this.dweloAPI, accessory);
        break;
      case 'dimmer':
        accessoryHandler = new DweloDimmerAccessory(this, this.log, this.api, this.dweloAPI, accessory);
        break;
      case 'thermostat':
        accessoryHandler = new DweloThermostatAccessory(this, this.log, this.api, this.dweloAPI, accessory);
        break;
      default:
        this.log.warn(`Support for Dwelo accessory type: ${accessory.context.device.device_type} is not implemented`);
        break;
    }
    if (accessoryHandler) {
      this.accessoryHandlers.push(accessoryHandler);
    }
  }

  async getRefreshedStatusData(): Promise<RefreshedStatus> {
    const now = Date.now();
    if (this.refreshedStatusPromise && (now - this.lastRefreshedStatusTime < 2000)) {
      this.log.debug('Using cached refreshed status data promise');
      return this.refreshedStatusPromise;
    }

    this.log.debug('Refreshing status data');
    this.lastRefreshedStatusTime = now;
    this.refreshedStatusPromise = this.dweloAPI.getRefreshedStatus();
    this.refreshedStatus = await this.refreshedStatusPromise;
    this.refreshedStatusPromise = null;
    return this.refreshedStatus;
  }

  async updateAllAccessories() {
    const status = await this.getRefreshedStatusData();
    const devices = [
      ...status['LIGHTS AND SWITCHES'],
      ...status.LOCKS,
      ...status.THERMOSTATS,
    ];

    for (const accessory of this.accessoryHandlers) {
      const device = devices.find(d => d.device_id === accessory.accessory.context.device.device_id);
      if (device) {
        accessory.updateState(device);
      }
    }
  }
}