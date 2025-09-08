import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

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

interface QueuedRequest<T> {
  path: string;
  config: AxiosRequestConfig<T>;
  resolve: (value: AxiosResponse<T>) => void;
  reject: (reason?: any) => void;
}

export class DweloAPI {
  private commandQueue: QueuedRequest<any>[] = [];
  private processingPromise: Promise<void> = Promise.resolve();

  constructor(private readonly token: string, private readonly gatewayID: string) { }

  public async getRefreshedStatus(): Promise<RefreshedStatus> {
    const response = await this.request<RefreshedStatus>(`/mobile/v1/devices/${this.gatewayID}/`);
    return response.data;
  }

  public async setSwitchState(on: boolean, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': on ? 'on' : 'off' },
    });
  }

  public async setDimmerState(on: boolean, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': on ? 'on' : 'off' },
    });
  }

  public async setDimmerBrightness(brightness: number, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': 'Multilevel On', 'commandValue': brightness.toString(), 'applicationId': 'ios' },
    });
  }

  public async setThermostatMode(mode: string, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': mode, 'applicationId': 'ios' },
    });
  }

  public async setThermostatTemperature(mode: string, temperature: number, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': mode, 'commandValue': temperature.toString(), 'applicationId': 'ios' },
    });
  }

  public async setLockState(locked: boolean, id: number) {
    await this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': locked ? 'lock' : 'unlock' }, // Use 'lock'/'unlock' directly
    });

    const target = locked ? 'True' : 'False';
    await poll({
      requestFn: () => this.getRefreshedStatus(),
      stopCondition: (status) => {
        const device = status.LOCKS.find(d => d.device_id === id);
        return device?.sensors.DoorLocked === target;
      },
      interval: 2000,
      timeout: 20000,
    });
  }

  private async request<T>(
    path: string,
    config: AxiosRequestConfig<T> = {},
  ): Promise<AxiosResponse<T>> {
    return new Promise<AxiosResponse<T>>((resolve, reject) => {
      this.commandQueue.push({ path, config, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    this.processingPromise = this.processingPromise.then(async () => {
      if (this.commandQueue.length > 0) {
        const { path, config, resolve, reject } = this.commandQueue.shift()!;
        try {
          console.log(`Dwelo API Request: ${config.method ?? 'GET'} ${path}`, { params: config.params, data: config.data });
          const response = await axios({
            url: 'https://api.dwelo.com' + path,
            method: config.method ?? 'GET',
            params: config.params,
            data: config.data,
            headers: {
              ...config.headers,
              Authorization: `Token ${this.token} `,
            },
          });
          console.log('Dwelo API Response:', response.data);
          resolve(response);
        } catch (error) {
          console.error('Dwelo API request failed:', error);
          reject(error);
        } finally {
          // Delay for rate limiting (10 requests per second = 100ms delay)
          await new Promise(r => setTimeout(r, 100));
        }
      }
    });
  }
}

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