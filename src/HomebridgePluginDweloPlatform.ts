import { API, StaticPlatformPlugin, PlatformConfig, AccessoryPlugin, Logging } from 'homebridge';

import { DweloAPI } from './DweloAPI';
import { DweloSwitchAccessory } from './DweloSwitchAccessory';

export class HomebridgePluginDweloPlatform implements StaticPlatformPlugin {
  private readonly dweloAPI: DweloAPI;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.dweloAPI = new DweloAPI(config.token, config.gatewayId);

    this.log.debug(`Finished initializing platform: ${this.config.name}`);
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    this.dweloAPI.devices().then(devices => {
      const accessories = devices
        .map(d => {
          switch (d.deviceType) {
            case 'switch':
              return new DweloSwitchAccessory(this.api.hap, this.log, this.dweloAPI, d.givenName, d.uid);
            // case 'lock':
            default:
              this.log.warn(`Support for Dwelo accessory type: ${d.deviceType} is not implemented`);
              this.log.warn(`${d}`);
              return null;
          }
        })
        .filter((a): a is DweloSwitchAccessory => !!a);

      callback(accessories);
    });
  }
}
