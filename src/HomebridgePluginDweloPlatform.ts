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
  private lastPingTime = 0;
  private refreshedStatusPromise: Promise<RefreshedStatus> | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.dweloAPI = new DweloAPI(config.token, config.gatewayId, this.log);

    this.log.info(`Dwelo Plugin Version: ${version}`);
    this.log.debug(`Finished initializing platform: ${this.config.name}`);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      setInterval(() => this.updateAllAccessories().catch(error => {
        this.log.error('An error occurred during periodic accessory update:', error);
      }), POLLING_INTERVAL);
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
    }).catch(error => {
      this.log.error('Failed to discover devices during startup. Please check your configuration and network connection.', error);
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

    // Ping the hub to encourage it to report its latest status, but not more than
    // once every 30 seconds to avoid abusing the connection.
    if (now - this.lastPingTime > POLLING_INTERVAL) {
      this.lastPingTime = now;
      try {
        this.log.debug('Pinging hub to encourage a status update.');
        await this.dweloAPI.pingHub();
        // The hub may need a moment after the ping to gather updated device statuses.
        // Let's add a short delay before requesting the data.
        this.log.debug('Waiting for 2 seconds after ping to allow hub to update...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        this.log.warn('Hub ping failed, proceeding with status refresh anyway.');
      }
    }

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