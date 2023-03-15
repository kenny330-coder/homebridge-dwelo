
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

interface Device {
  addressId: number;
  dateRegistered: string;
  deviceType: 'lock' | 'switch';
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

interface ListDevicesResponse {
  results: Device[];
  resultsCount: number;
  totalCount: number;
}

interface Sensor {
  deviceId: number;
  gatewayId: number;
  sensorType: string;
  timeIssued: string;
  uid: number;
  value: string;
}

interface ListSensorsResponse {
  results: Sensor[];
  resultsCount: number;
  totalCount: number;
}

export class DweloAPI {
  constructor(private readonly token: string, private readonly gatewayID: string) { }

  public async devices(): Promise<Device[]> {
    const response = await this.request<ListDevicesResponse>('/v3/device', {
      params: {
        gatewayId: this.gatewayID,
        limit: 5000,
        offset: 0,
      },
    });
    return response.data.results;
  }

  public async sensor(deviceId: number): Promise<Sensor | undefined> {
    const response = await this.request<ListSensorsResponse>(`/v3/sensor/gateway/${this.gatewayID}/`, {
      params: {
        deviceId,
      },
    });
    return response.data.results[0];
  }

  public async toggleSwitch(on: boolean, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': on ? 'on' : 'off' },
    });
  }

  public async toggleLock(locked: boolean, id: number) {
    return this.request(`v3/device/${id}/command/`, {
      method: 'POST',
      data: { 'command': locked ? 'lock' : 'unlock' },
    });
  }

  private async request<T>(
    path: string,
    { headers, method, data, params }: AxiosRequestConfig<T> = {},
  ): Promise<AxiosResponse<T>> {
    const response = await axios({
      url: 'https://api.dwelo.com' + path,
      method: method ?? 'GET',
      params,
      data,
      headers: {
        ...headers,
        Authorization: `Token ${this.token} `,
      },
    });
    return response;
  }
}