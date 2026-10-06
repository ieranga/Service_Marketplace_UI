const isBrowser = typeof window !== 'undefined';
const host = isBrowser ? window.location.hostname : 'localhost';
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');

// Live MonsterASP.NET API URL:
export const PRODUCTION_API_URL = 'https://servicemarketplaceapi.runasp.net/api';

export const environment = {
  production: !isLocal,
  apiUrl: isLocal ? `http://${host}:5257/api` : PRODUCTION_API_URL
};
