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


export class DweloSwitchAccessory extends StatefulAccessory {
  private readonly service: Service;

  constructor(platform: HomebridgePluginDweloPlatform, log: Logging, api: API, dweloAPI: DweloAPI, accessory: PlatformAccessory) {
    super(platform, log, api, dweloAPI, accessory);

    // Remove the old Switch service if it exists
    const switchService = this.accessory.getService(this.api.hap.Service.Switch);
    if (switchService) {
      this.accessory.removeService(switchService);
    }

    this.service = this.accessory.getService(this.api.hap.Service.Lightbulb) || this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(async () => {
        await this.refresh();
        return this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
      })
      .onSet(async (value) => {
        const isOn = value as boolean;
        try {
          await this.dweloAPI.setSwitchState(isOn, this.accessory.context.device.device_id);
          this.log.debug(`Switch state change command sent: ${isOn ? 'ON' : 'OFF'}`);

          const targetState = isOn ? 'On' : 'Off';
          await poll({
            requestFn: () => this.platform.getRefreshedStatusData(),
            stopCondition: (status) => {
              const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === this.accessory.context.device.device_id);
              return device?.sensors.Switch === targetState;
            },
            interval: 2000, // Start with 2 seconds
            timeout: 20000, // 20 seconds timeout
          });

          this.log.debug(`Switch state successfully updated to: ${isOn ? 'ON' : 'OFF'}`);
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);

        } catch (error) {
          this.log.error('Error setting switch state:', error);
          this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(!isOn);
        }
      });

    this.log.info(`Dwelo Switch '${this.accessory.displayName}' created!`);
  }

  async updateState(device: LightAndSwitch): Promise<void> {
    const isOn = device.sensors.Switch === 'On';
    this.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(isOn);
    this.log.debug(`Switch state updated to: ${isOn ? 'ON' : 'OFF'}`);
  }
}