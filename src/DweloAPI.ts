
import axios, { AxiosResponse } from 'axios';

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

export class DweloAPI {
  constructor(private readonly token: string, private readonly gatewayID: string) { }

  public async devices(): Promise<Device[]> {
    const response = await this.request<ListDevicesResponse>(`/v3/device?gatewayId=${this.gatewayID}&limit=5000&offset=0`);
    return response.data.results;
  }

  public async toggleSwitch(on: boolean, id: number) {
    return this.request(`/v3/device/${id}/command/`, {
      method: 'POST',
      body: { 'command': on ? 'on' : 'off' },
    });
  }

  private async request<T>(
    path: string,
    { headers, method, body }: { headers?: Record<string, string>; method?: string; body?: Record<string, unknown> } = {},
  ): Promise<AxiosResponse<T>> {
    const response = await axios({
      url: 'https://api.dwelo.com' + path,
      method: method ?? 'GET',
      data: body,
      headers: {
        ...headers,
        Authorization: `Token ${this.token} `,
      },
    });
    return response;
  }
}