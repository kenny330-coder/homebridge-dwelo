import {
  AccessoryPlugin,
  API,
  Logging,
  Service,
} from 'homebridge';
import { CachedRequest } from './CachedRequest';
import { DweloAPI, Sensor } from './DweloAPI';

export class DweloSwitchAccessory implements AccessoryPlugin {
  name: string;

  private readonly log: Logging;
  private readonly service: Service;
  private sensorCache: CachedRequest<Sensor[]>;

  constructor(log: Logging, api: API, dweloAPI: DweloAPI, name: string, switchID: number) {
    this.log = log;
    this.name = name;

    this.sensorCache = new CachedRequest(1000, () => dweloAPI.sensors(switchID));

    this.service = new api.hap.Service.Switch(this.name);
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

    log.info(`Dwelo Switch '${name} ' created!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.service];
  }
}
