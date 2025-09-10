import axios, { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { Logging } from 'homebridge';
import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS } from './constants';

interface ListResponse {
  resultsCount: number;
  totalCount: number;
}

export interface Device {
  addressId: number;
  dateRegistered: string;
  deviceType: 'lock' | 'switch' | 'dimmer' | 'thermostat';
  device_metadata: Record<string, string>;
  gatewayId: string;
  givenName: string;
  isActive: boolean;
  isOnline: boolean;
  leasee: number;
  localId: string;
  metadata_id: string;
  uid: number;
}

interface ListDevicesResponse extends ListResponse {
  results: Device[];
}

export interface Sensor {
  deviceId: number;
  gatewayId: number;
  sensorType: string;
  timeIssued: string;
  uid: number;
  value: string;
}

interface ListSensorsResponse extends ListResponse {
  results: Sensor[];
}

export interface RefreshedStatus {
  GATEWAY: Gateway;
  'LIGHTS AND SWITCHES': (LightAndSwitch)[];
  LOCKS: (Lock)[];
  THERMOSTATS: (Thermostat)[];
}

export interface Gateway {
  device_id: number;
  device_metadata: DeviceMetadata;
  device_type: string;
  model: null;
  name: string;
  sensors: GatewaySensors;
}

export interface DeviceMetadata {
  commands: string[];
  long_name: string;
  power_source: string;
  provisioning_type: string;
  sensor_readings: string[];
  short_name: string;
  transport: string[];
  type: string;
  'wi-fi_ap': boolean;
  'wi-fi_backhaul': boolean;
}

export interface GatewaySensors {
  HubConnectionStatus: HubConnectionStatus;
  WifiConnections: WifiConnection[];
  WifiVisibleAps: WifiVisibleAp[];
  heartbeat: Heartbeat;
  network_interfaces: NetworkInterfaces;
}

export interface HubConnectionStatus {
  lastCommunicationReceived: string;
}

export interface WifiConnection {
  is_active: boolean;
  ssid: string;
  uuid: string;
}

export interface WifiVisibleAp {
  security: string[];
  ssid: string;
  strength_percent: number;
}

export interface Heartbeat {
  timestamp: string;
}

export interface NetworkInterfaces {
  'cdc-wdm0': CdcWdm0;
  eth0: Eth0;
  wlan0: Wlan0;
}

export interface CdcWdm0 {
  ip_address: string;
  state: string;
  type: string;
}

export interface Eth0 {
  ip_address: string;
  state: string;
  type: string;
}

export interface Wlan0 {
  ip_address: null;
  state: string;
  type: string;
}

export interface LightAndSwitch {
  device_id: number;
  device_metadata: LightAndSwitchDeviceMetadata;
  device_type: string;
  model: null;
  name: string;
  sensors: LightAndSwitchSensors;
}

export interface LightAndSwitchDeviceMetadata {
  brand: string;
  commands: string[];
  highest_dim_value?: number;
  load: string;
  long_name: string;
  lowest_dim_value?: number;
  off_value?: number;
  on_value?: number;
  power_source: string;
  provisioning_type: string;
  recall_dim_value?: number;
  sensor_readings: string[];
  short_name: string;
  transport: string[];
  type: string;
}

export interface LightAndSwitchSensors {
  Percent?: number;
  Switch: string;
}

export interface Lock {
  device_id: number;
  device_metadata: LockDeviceMetadata;
  device_type: string;
  model: null;
  name: string;
  sensors: LockSensors;
}

export interface LockDeviceMetadata {
  commands: string[];
  keypad_buttons: number;
  keyway: boolean;
  long_name: string;
  power_source: string;
  provisioning_type: string;
  sensor_readings: string[];
  short_name: string;
  transport: string[];
  type: string;
}

export interface LockSensors {
  BatteryLevel: number;
  DoorLocked: string;
  LockChange: string;
}

export interface Thermostat {
  device_id: number;
  device_metadata: ThermostatDeviceMetadata;
  device_type: string;
  model: null;
  name: string;
  sensors: ThermostatSensors;
}

export interface ThermostatDeviceMetadata {
  brand: string;
  commands: string[];
  cool_setpoint_high: number;
  cool_setpoint_low: number;
  fan_modes: string[];
  heat_setpoint_high: number;
  heat_setpoint_low: number;
  hvac_modes: string[];
  long_name: string;
  min_setpoint_differential: number;
  power_source: string;
  provisioning_type: string;
  sensor_readings: string[];
  short_name: string;
  transport: string[];
  type: string;
}

export interface ThermostatSensors {
  Humidity: number;
  Temperature: Temperature;
  ThermostatCoolSetpoint: Temperature;
  ThermostatFanMode: string;
  ThermostatHeatSetpoint: Temperature;
  ThermostatMode: string;
  ThermostatOperatingState: string;
}

export interface Temperature {
  unit: string;
  value: number;
}

export class DweloAPI {
  constructor(
    private readonly token: string,
    private readonly gatewayID: string,
    private readonly log: Logging,
  ) { }

  public async pingHub(): Promise<void> {
    await this.request(`/v4/hub/${this.gatewayID}/ping/`, {
      method: 'POST',
    });
  }

  public async setThermostatFanMode(fanMode: string, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: 'FanMode', commandValue: fanMode, applicationId: 'ios' },
      pollStopCondition: (status) => {
        const device = status.THERMOSTATS.find(d => d.device_id === id);
        return device?.sensors.ThermostatFanMode === fanMode;
      },
    });
  }

  public async getRefreshedStatus(): Promise<RefreshedStatus> {
    const response = await this.request<RefreshedStatus>(`/mobile/v1/devices/${this.gatewayID}/`);
    return response.data;
  }

  public async setSwitchState(on: boolean, id: number): Promise<void> {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: on ? 'on' : 'off' },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Switch === (on ? 'On' : 'Off');
      },
    });
  }

  public async setDimmerState(on: boolean, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: on ? 'on' : 'off' },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Switch === (on ? 'On' : 'Off');
      },
    });
  }

  public async setDimmerBrightness(brightness: number, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: 'Multilevel On', commandValue: brightness.toString(), applicationId: 'ios' },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Percent === brightness;
      },
    });
  }

  public async setThermostatMode(mode: string, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: mode, applicationId: 'ios' },
      pollStopCondition: (status) => {
        const device = status.THERMOSTATS.find(d => d.device_id === id);
        return device?.sensors.ThermostatMode.toLowerCase() === mode.toLowerCase();
      },
    });
  }

  public async setThermostatTemperature(mode: string, temperature: number, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: mode, commandValue: temperature.toString(), applicationId: 'ios' },
      pollStopCondition: (status) => {
        const device = status.THERMOSTATS.find(d => d.device_id === id);
        if (mode === 'heat') {
          return device?.sensors.ThermostatHeatSetpoint.value === temperature;
        } else if (mode === 'cool') {
          return device?.sensors.ThermostatCoolSetpoint.value === temperature;
        }
        return false;
      },
    });
  }

  public async setLockState(locked: boolean, id: number) {
    await this.sendCommandAndPoll({
      deviceId: id,
      commandPayload: { command: locked ? 'lock' : 'unlock' },
      pollStopCondition: (status) => {
        const device = status.LOCKS.find(d => d.device_id === id);
        return device?.sensors.DoorLocked === (locked ? 'True' : 'False');
      },
    });
  }

  private async sendCommandAndPoll({ deviceId, commandPayload, pollStopCondition }: {
    deviceId: number;
    commandPayload: Record<string, string>;
    pollStopCondition: (status: RefreshedStatus) => boolean;
  }): Promise<void> {
    const logPrefix = `[Device ${deviceId}]`;
    await this.request(`/v3/device/${deviceId}/command/`, { method: 'POST', data: commandPayload });
    await poll({
      requestFn: () => this.getRefreshedStatus(),
      stopCondition: pollStopCondition,
      interval: POLLING_INTERVAL_MS,
      timeout: POLLING_TIMEOUT_MS,
      log: this.log,
      logPrefix: `${logPrefix} Polling for state change`,
    });
  }

  private async request<T>(
    path: string,
    config: AxiosRequestConfig<T> = {},
  ): Promise<AxiosResponse<T>> {
    try {
      this.log.debug(`Dwelo API Request: ${config.method ?? 'GET'} ${path}`, { params: config.params, data: config.data });
      const response = await axios({
        url: 'https://api.dwelo.com' + path,
        ...config,
        headers: {
          ...config.headers,
          'Authorization': `Token ${this.token}`,
          'User-Agent': 'Dwelo/2.3.4 (iPhone; iOS 14.4; Scale/2.00)',
        },
      });
      this.log.debug('Dwelo API Response:', response.data);
      return response;
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 401) {
          this.log.error('Authentication failed (401 Unauthorized). Please check that your Dwelo API token in the plugin configuration is correct and has not expired.');
        }
        this.log.error(`API request to ${path} failed with status ${error.response?.status}: ${error.message}`);
        if (error.response?.data) {
          const responseData = typeof error.response.data === 'string' && error.response.data.startsWith('<!DOCTYPE HTML')
            ? `HTML response (length: ${error.response.data.length})`
            : JSON.stringify(error.response.data);
          this.log.error(`Response data: ${responseData}`);
        }
      } else {
        this.log.error('An unexpected error occurred during API request:', error);
      }
      // Re-throw the error so the calling function knows it failed.
      throw error;
    }
  }
}

import { poll } from './util';