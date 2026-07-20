export const ndidApiCallbackIp: string =
  process.env.NDID_API_CALLBACK_IP || 'localhost';

export const ndidApiCallbackPort: number = parseInt(
  process.env.NDID_API_CALLBACK_PORT || '6001',
);

const apiServerAddress: string =
  process.env.API_SERVER_ADDRESS || 'http://localhost:8200';

export const serverPort: number = parseInt(process.env.SERVER_PORT || '9000');

export const ndidApiBaseUrl: string = `${apiServerAddress}/v7`;
export const yourDataApiBaseUrl: string = `${apiServerAddress}/v7`;

export const AS_NODES: Array<{
  id: string;
  name: string;
  nameTh: string;
  baseUrl: string;
}> = [
  {
    id: 'as1',
    name: 'Alpha Bank',
    nameTh: 'อัลฟ่า แบงก์',
    baseUrl: process.env.AS1_BASE_URL ?? 'http://localhost:8300',
  },
  {
    id: 'as2',
    name: 'Beta Bank',
    nameTh: 'เบต้า แบงก์',
    baseUrl: process.env.AS2_BASE_URL ?? 'http://localhost:8400',
  },
];
