import axios, { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { Logging } from 'homebridge';
import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS } from './constants';
import { debounce, poll, PollAbortedError } from './util';

const DEBOUNCE_WAIT_MS = 1500;

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

type CommandPollParams = {
  deviceId: number;
  commandPayload: Record<string, string>;
  pollStopCondition: (status: RefreshedStatus) => boolean;
};

export class DweloAPI {
  constructor(
    private readonly token: string,
    private readonly gatewayID: string,
    private readonly log: Logging,
  ) { }

  private pollingControllers = new Map<number, AbortController>();

  private debouncedCommandPollers = new Map<string, (params: CommandPollParams) => void>();

  private getDebouncedPoller(deviceId: number, command: string): (params: CommandPollParams) => void {
    const key = `${deviceId}-${command}`;
    if (!this.debouncedCommandPollers.has(key)) {
      this.log.debug(`Creating new debounced poller for ${key}`);
      const poller = debounce(
        (params: CommandPollParams) => this.sendCommandAndPoll(params),
        DEBOUNCE_WAIT_MS,
        true,
      );
      this.debouncedCommandPollers.set(key, poller);
    }
    return this.debouncedCommandPollers.get(key)!;
  }

  public async pingHub(): Promise<void> {
    await this.request(`/v4/hub/${this.gatewayID}/ping/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Match packet capture for empty POST
    });
  }

  public async setThermostatFanMode(fanMode: string, id: number) {
    const command = 'FanMode';
    this.getDebouncedPoller(id, command)({
      deviceId: id,
      commandPayload: { command, commandValue: fanMode },
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
    const command = on ? 'on' : 'off';
    this.getDebouncedPoller(id, command)({
      deviceId: id,
      commandPayload: { command },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Switch === (on ? 'On' : 'Off');
      },
    });
  }

  public async setDimmerState(on: boolean, id: number) {
    const command = on ? 'on' : 'off';
    this.getDebouncedPoller(id, command)({
      deviceId: id,
      commandPayload: { command },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Switch === (on ? 'On' : 'Off');
      },
    });
  }

  public async setDimmerBrightness(brightness: number, id: number) {
    const command = 'Multilevel On';
    this.getDebouncedPoller(id, command)({
      deviceId: id,
      commandPayload: { command, commandValue: brightness.toString() },
      pollStopCondition: (status) => {
        const device = status['LIGHTS AND SWITCHES'].find(d => d.device_id === id);
        return device?.sensors.Percent === brightness;
      },
    });
  }

  public async setThermostatMode(mode: string, id: number) {
    this.getDebouncedPoller(id, mode)({
      deviceId: id,
      commandPayload: { command: mode },
      pollStopCondition: (status) => {
        const device = status.THERMOSTATS.find(d => d.device_id === id);
        return device?.sensors.ThermostatMode.toLowerCase() === mode.toLowerCase();
      },
    });
  }

  public async setThermostatTemperature(mode: string, temperature: number, id: number) {
    this.getDebouncedPoller(id, mode)({
      deviceId: id,
      commandPayload: { command: mode, commandValue: temperature.toString() },
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
    const command = locked ? 'lock' : 'unlock';
    this.getDebouncedPoller(id, command)({
      deviceId: id,
      commandPayload: { command },
      pollStopCondition: (status) => {
        const device = status.LOCKS.find(d => d.device_id === id);
        return device?.sensors.DoorLocked === (locked ? 'True' : 'False');
      },
    });
  }

  private async sendCommandAndPoll({ deviceId, commandPayload, pollStopCondition }: CommandPollParams): Promise<void> {
    // Cancel any existing polling for this device.
    if (this.pollingControllers.has(deviceId)) {
      this.log.debug(`[Device ${deviceId}] New command received, cancelling previous polling operation.`);
      this.pollingControllers.get(deviceId)?.abort();
    }

    // Create a new AbortController for this operation.
    const controller = new AbortController();
    this.pollingControllers.set(deviceId, controller);

    const logPrefix = `[Device ${deviceId}]`;
    const fullCommandPayload = { ...commandPayload, applicationId: 'ios' };
    await this.request(`/v3/device/${deviceId}/command/`, { method: 'POST', data: fullCommandPayload });
    try {
      this.log.debug(`${logPrefix} Command sent successfully. Initiating background polling for state confirmation.`);

      // Start polling in the background. DO NOT AWAIT IT.
      // This allows the sendCommandAndPoll promise to resolve immediately,
      // giving HomeKit quick feedback.
      poll({
        requestFn: () => this.getRefreshedStatus(),
        stopCondition: pollStopCondition,
        interval: POLLING_INTERVAL_MS,
        timeout: POLLING_TIMEOUT_MS,
        log: this.log,
        logPrefix: `${logPrefix} Background polling for state change`,
        signal: controller.signal,
      }).catch(error => {
        // Handle errors from the background poll. These errors won't affect the
        // immediate resolution of the sendCommandAndPoll promise.
        if (error instanceof PollAbortedError) {
          this.log.debug(`${logPrefix} Background polling was aborted by a new command.`);
        } else if (error instanceof Error && error.message.includes('timed out')) {
          this.log.warn(`${logPrefix} Background state confirmation poll timed out. This can happen if the command was dropped or the network is slow. Resending command once more as a fallback.`);
          // Re-send the command, but don't wait for confirmation this time.
          // This is a "fire and forget" retry for the background.
          if (!controller.signal.aborted) {
            this.request(`/v3/device/${deviceId}/command/`, { method: 'POST', data: fullCommandPayload })
              .then(() => this.log.debug(`${logPrefix} Fallback command sent successfully in background.`))
              .catch(retryError => this.log.error(`${logPrefix} Background fallback command also failed.`, retryError));
          }
        } else {
          this.log.error(`${logPrefix} Background polling failed with an unexpected error:`, error);
        }
      }).finally(() => {
        // Clean up the controller once the background poll (or its error handling) completes.
        if (this.pollingControllers.get(deviceId) === controller) {
          this.pollingControllers.delete(deviceId);
        }
      });

      // The sendCommandAndPoll promise resolves here, after the command is sent
      // but before the background polling completes.
      return;

    } catch (error) {
      // If the initial command sending fails, this error is immediately propagated.
      if (isAxiosError(error)) {
        this.log.error(`${logPrefix} Initial command sending failed with status ${error.response?.status}: ${error.message}`);
      } else {
        this.log.error(`${logPrefix} An unexpected error occurred during initial command sending:`, error);
      }
      // Clean up the controller immediately if the initial command failed.
      if (this.pollingControllers.get(deviceId) === controller) {
        this.pollingControllers.delete(deviceId);
      }
      throw error; // Re-throw to indicate immediate failure to HomeKit
    }
  }

  private async request<T>(
    path: string,
    config: AxiosRequestConfig<T> = {},
  ): Promise<AxiosResponse<T>> {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 500;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.log.debug(`Dwelo API Request (Attempt ${attempt}/${MAX_RETRIES}): ${config.method ?? 'GET'} ${path}`, { params: config.params, data: config.data });
        const response = await axios({
          url: 'https://api.dwelo.com' + path,
          ...config,
          headers: {
            ...config.headers,
            'Authorization': `Token ${this.token}`,
            // This specific User-Agent seems to be required by the mobile API endpoint.
            'User-Agent': 'Dwelo/3 CFNetwork/3860.100.1 Darwin/25.0.0',
            // This custom protocol version header also appears to be required.
            'X-Dwelo-Protocol-Version': '1.1',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        this.log.debug('Dwelo API Response:', response.data);
        return response; // Success, exit the loop and return
      } catch (error) {
        lastError = error;
        if (isAxiosError(error)) {
          // 502, 503, 504 are transient server errors worth retrying.
          const isRetryable = error.response && [502, 503, 504].includes(error.response.status);

          if (isRetryable && attempt < MAX_RETRIES) {
            const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
            this.log.warn(`API request to ${path} failed with status ${error.response?.status} (Attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Go to the next iteration of the loop
          } else if (error.response?.status === 401) {
            this.log.error('Authentication failed (401 Unauthorized). Please check that your Dwelo API token is correct and has not expired.');
            break; // Don't retry on auth errors
          }
        }
        // For non-retryable errors or if all retries fail, break the loop.
        break;
      }
    }

    // If we've exhausted all retries, log the final error and re-throw it.
    if (isAxiosError(lastError)) {
      this.log.error(`API request to ${path} failed after ${MAX_RETRIES} attempts with status ${lastError.response?.status}: ${lastError.message}`);
      if (lastError.response?.data) {
        const responseData = typeof lastError.response.data === 'string' && lastError.response.data.startsWith('<!DOCTYPE HTML')
          ? `HTML response (length: ${lastError.response.data.length})`
          : JSON.stringify(lastError.response.data);
        this.log.error(`Final response data: ${responseData}`);
      }
    }
    throw lastError; // Re-throw the last captured error
  }
}
