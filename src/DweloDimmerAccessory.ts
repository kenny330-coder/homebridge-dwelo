import {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { DweloAPI, LightAndSwitch } from './DweloAPI';
import { StatefulAccessory } from './StatefulAccessory';
import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';

// Poll function copied from DweloAPI.ts
function poll<T>({ requestFn, stopCondition, interval, timeout }: {
  requestFn: () => Promise<T>;
  stopCondition: (response: T) => boolean;
  interval: number;
  timeout: number;
}): Promise<T> {
  let stop = false;
  let attempt = 1;

  const executePoll = async (resolve: (r: T) => unknown, reject: (e: Error) => void) => {
    const result = await requestFn();

    let stopConditionalResult: boolean;
    try {
      stopConditionalResult = stopCondition(result);
    } catch (e) {
      reject(e as Error);
      return;
    }

    if (stopConditionalResult) {
      resolve(result);
    } else if (stop) {
      reject(new Error('timeout'));
    } else {
      setTimeout(executePoll, interval * Math.pow(2, attempt++), resolve, reject);
    }
  };

  const pollResult = new Promise<T>(executePoll);
  const maxTimeout = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Exceeded max timeout'));
      stop = true;
    }, timeout);
  });

  return Promise.race([pollResult, maxTimeout]);
}


export class DweloDimmerAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        const isOn = value as boolean;
        try {
          if (isOn) { // Turning On
            let lastBrightness = this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value as number;
            if (lastBrightness === 0) {
              lastBrightness = 100; // Default to 100 if last brightness was 0
            }
            await this.dweloAPI.setDimmerBrightness(lastBrightness, this.accessory.context.device.device_id);
            await poll({
              requestFn: () => this.platform.getRefreshedStatusData(),
              stopCondition: (status) => {
                const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === this.accessory.context.device.device_id);
                return device?.sensors.Switch === 'On' && device?.sensors.Percent === lastBrightness;
              },
              interval: 2000,
              timeout: 20000,
            });
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(lastBrightness);
            this.log.debug(`Dimmer state was set to: ON with brightness ${lastBrightness}`);
          } else { // Turning Off
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            await poll({
                requestFn: () => this.platform.getRefreshedStatusData(),
                stopCondition: (status) => {
                  const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === this.accessory.context.device.device_id);
                  return device?.sensors.Switch === 'Off';
                },
                interval: 2000,
                timeout: 20000,
              });
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            this.log.debug('Dimmer state was set to: OFF');
          }
        } catch (error) {
          this.log.error('Error setting dimmer state:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(!isOn);
        }
      });

    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).value;
      })
      .onSet(async (value) => {
        const brightness = value as number;
        try {
          if (brightness === 0) {
            await this.dweloAPI.setDimmerState(false, this.accessory.context.device.device_id);
            await poll({
                requestFn: () => this.platform.getRefreshedStatusData(),
                stopCondition: (status) => {
                  const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === this.accessory.context.device.device_id);
                  return device?.sensors.Switch === 'Off';
                },
                interval: 2000,
                timeout: 20000,
            });
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(0);
            this.log.debug(`Dimmer set to OFF (brightness 0)`);
          } else {
            await this.dweloAPI.setDimmerBrightness(brightness, this.accessory.context.device.device_id);
            await poll({
                requestFn: () => this.platform.getRefreshedStatusData(),
                stopCondition: (status) => {
                  const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === this.accessory.context.device.device_id);
                  return device?.sensors.Switch === 'On' && device?.sensors.Percent === brightness;
                },
                interval: 2000,
                timeout: 20000,
            });
            this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(true);
            this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);
            this.log.debug(`Dimmer brightness was set to: ${brightness}`);
          }
        } catch (error) {
          this.log.error('Error setting dimmer brightness:', error);
          // Revert on error
          this.refresh();
        }
      });

    this.log.info(`Dwelo Dimmer '${this.accessory.displayName}' created!`);
  }

  async updateState(device: LightAndSwitch): Promise<void> {
    const isOn = device.sensors.Switch === 'On';
    const brightness = device.sensors.Percent || 0;

    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.service.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(brightness);

    this.log.debug(`Dimmer state updated to: ${isOn ? 'ON' : 'OFF'}, Brightness: ${brightness}`);
  }
}