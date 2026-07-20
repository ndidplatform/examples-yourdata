import path from 'path';

export const ndidApiCallbackIp: string =
  process.env.NDID_API_CALLBACK_IP || 'localhost';

export const ndidApiCallbackPort: number = parseInt(
  process.env.NDID_API_CALLBACK_PORT || '6000',
);

const apiServerAddress: string =
  process.env.API_SERVER_ADDRESS || 'http://localhost:8100';

export const serverPort: number = parseInt(process.env.SERVER_PORT || '8000');

export const keyPath: string = path.join(process.cwd(), 'keys') + '/';

export const ndidApiBaseUrl: string = `${apiServerAddress}/v7`;
