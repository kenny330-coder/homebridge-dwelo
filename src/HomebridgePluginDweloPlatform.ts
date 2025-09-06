import { API, DynamicPlatformPlugin, PlatformConfig, Logging, PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { version } from '../package.json';

import { DweloAPI, Sensor } from './DweloAPI';
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
  private lastSensorUpdateTime = 0;
  private sensors: Sensor[] = [];
  private sensorPromise: Promise<Sensor[]> | null = null;

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
    this.dweloAPI.devices().then(devices => {
      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.uid.toString());
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = device;
          this.createAccessory(existingAccessory);
        } else {
          this.log.info('Adding new accessory:', device.givenName);
          const accessory = new this.api.platformAccessory(device.givenName, uuid);
          accessory.context.device = device;
          this.createAccessory(accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    });
  }

  createAccessory(accessory: PlatformAccessory) {
    let accessoryHandler;
    switch (accessory.context.device.deviceType) {
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
        this.log.warn(`Support for Dwelo accessory type: ${accessory.context.device.deviceType} is not implemented`);
        break;
    }
    if (accessoryHandler) {
      this.accessoryHandlers.push(accessoryHandler);
    }
  }

  async getSensors(): Promise<Sensor[]> {
    const now = Date.now();
    if (this.sensorPromise && (now - this.lastSensorUpdateTime < 2000)) {
      this.log.debug('Using cached sensor data promise');
      return this.sensorPromise;
    }

    this.log.debug('Refreshing sensor data');
    this.lastSensorUpdateTime = now;
    this.sensorPromise = this.dweloAPI.sensors();
    this.sensors = await this.sensorPromise;
    this.sensorPromise = null;
    return this.sensors;
  }

  async updateAllAccessories() {
    const sensors = await this.getSensors();
    for (const accessory of this.accessoryHandlers) {
      const accessorySensors = sensors.filter(s => s.deviceId === accessory.accessory.context.device.uid);
      accessory.updateState(accessorySensors);
    }
  }
}
