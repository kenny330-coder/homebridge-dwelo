import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
} from 'homebridge';

import { DweloAPI } from './DweloAPI';

export class DweloSwitchAccessory implements AccessoryPlugin {
  name: string;

  private readonly log: Logging;
  private readonly switchService: Service;

  constructor(hap: HAP, log: Logging, dweloAPI: DweloAPI, name: string, lightID: number) {
    this.log = log;
    this.name = name;

    this.switchService = new hap.Service.Switch(name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        dweloAPI.sensor(lightID)
          .then(sensor => {
            const isOn = sensor?.value === 'on';
            log.debug(`Current state of the switch was returned: ${isOn ? 'ON' : 'OFF'}`);
            callback(undefined, isOn);
          })
          .catch(callback);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        dweloAPI.toggleSwitch(value as boolean, lightID)
          .then(() => {
            log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
            callback();
          })
          .catch(callback);
      });


    log.info(`Dwelo LightBulb '${name}' created!`);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log('Identify!');
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [this.switchService];
  }
}