import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { CachedRequest } from './CachedRequest';
import { DweloAPI, Sensor } from './DweloAPI';

export class DweloDimmerAccessory {
  private readonly log: Logging;
  private readonly service: Service;
  private sensorCache: CachedRequest<Sensor[]>;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    this.log = log;

    const switchID = accessory.context.device.uid;
    this.sensorCache = new CachedRequest(1000, () => dweloAPI.sensors(switchID));

    this.service = accessory.getService(api.hap.Service.Lightbulb) || accessory.addService(api.hap.Service.Lightbulb);

    this.service.getCharacteristic(api.hap.Characteristic.On)
      .onGet(async () => {
        const sensors = await this.sensorCache.get();
        const isOn = sensors.find(s => s.sensorType === 'light')?.value === 'on';
        log.debug(`Current state of the dimmer was returned: ${isOn ? 'ON' : 'OFF'}`);
        return isOn;
      })
      .onSet(async value => {
        this.sensorCache.clear();
        await dweloAPI.toggleSwitch(value as boolean, switchID);
        log.debug(`Dimmer state was set to: ${value ? 'ON' : 'OFF'}`);
      });

    this.service.getCharacteristic(api.hap.Characteristic.Brightness)
      .onGet(async () => {
        const sensors = await this.sensorCache.get();
        const brightness = sensors.find(s => s.sensorType === 'Dimmer')?.value;
        log.debug(`Current brightness of the dimmer was returned: ${brightness}`);
        return parseInt(brightness || '0', 10);
      })
      .onSet(async value => {
        this.sensorCache.clear();
        await dweloAPI.setBrightness(value as number, switchID);
        log.debug(`Dimmer brightness was set to: ${value}`);
      });

    log.info(`Dwelo Dimmer '${accessory.displayName} ' created!`);
  }
}
