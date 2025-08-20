import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { CachedRequest } from './CachedRequest';
import { DweloAPI, Sensor } from './DweloAPI';

export class DweloSwitchAccessory {
  private readonly log: Logging;
  private readonly service: Service;
  private sensorCache: CachedRequest<Sensor[]>;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    this.log = log;

    const switchID = accessory.context.device.uid;
    this.sensorCache = new CachedRequest(1000, () => dweloAPI.sensors(switchID));

    this.service = accessory.getService(api.hap.Service.Switch) || accessory.addService(api.hap.Service.Switch);

    this.service.getCharacteristic(api.hap.Characteristic.On)
      .onGet(async () => {
        const sensors = await this.sensorCache.get();
        const isOn = sensors[0]?.value === 'on';
        log.debug(`Current state of the switch was returned: ${isOn ? 'ON' : 'OFF'}`);
        return isOn;
      })
      .onSet(async value => {
        this.sensorCache.clear();
        await dweloAPI.toggleSwitch(value as boolean, switchID);
        log.debug(`Switch state was set to: ${value ? 'ON' : 'OFF'}`);
      });

    log.info(`Dwelo Switch '${accessory.displayName} ' created!`);
  }
}
