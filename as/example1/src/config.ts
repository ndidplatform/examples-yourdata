export const ndidApiCallbackIp: string =
  process.env.NDID_API_CALLBACK_IP || 'localhost';

export const ndidApiCallbackPort: number = parseInt(
  process.env.NDID_API_CALLBACK_PORT || '6002',
);

const apiServerAddress: string =
  process.env.API_SERVER_ADDRESS || 'http://localhost:8300';

export const serverPort: number = parseInt(process.env.SERVER_PORT || '10000');

export const ndidApiBaseUrl: string = `${apiServerAddress}/v7`;
export const yourDataApiBaseUrl: string = `${apiServerAddress}/v7`;
