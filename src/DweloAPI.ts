import fetch, { Response } from 'node-fetch';

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
    const response = await this.send(`/v3/device?gatewayId=${this.gatewayID}&limit=5000&offset=0`);
    const data = await response.json() as ListDevicesResponse;
    return data.results;
  }

  public async toggleSwitch(on: boolean, id: number) {
    return this.send(`/v3/device/${id}/command/`, {
      method: 'POST',
      body: { 'command': on ? 'on' : 'off' },
    });
  }

  private async send(
    path: string,
    { headers, method, body }: { headers?: Record<string, string>; method?: string; body?: Record<string, unknown> } = {},
  ): Promise<Response> {
    const response = await fetch('https://api.dwelo.com' + path, {
      method: method ?? 'GET',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Token ${this.token} `,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`);
    }

    return response;
  }
}