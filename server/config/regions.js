// ============================================================
// SERVER REGIONS CONFIG
// ============================================================

export const REGIONS = [
  {
    id: 'us-east',
    label: 'US East (Virginia)',
    renderServiceUrl: process.env.RENDER_US_EAST_URL || 'http://localhost:3001',
    pingEndpoint: '/ping',
  },
  {
    id: 'us-west',
    label: 'US West (Oregon)',
    renderServiceUrl: process.env.RENDER_US_WEST_URL || 'http://localhost:3001',
    pingEndpoint: '/ping',
  },
  {
    id: 'eu-west',
    label: 'EU West (Frankfurt)',
    renderServiceUrl: process.env.RENDER_EU_WEST_URL || 'http://localhost:3001',
    pingEndpoint: '/ping',
  },
  {
    id: 'ap-southeast',
    label: 'Asia Pacific (Singapore)',
    renderServiceUrl: process.env.RENDER_AP_SE_URL || 'http://localhost:3001',
    pingEndpoint: '/ping',
  },
];

export const DEFAULT_REGION = 'us-east';

export function getRegion(id) {
  return REGIONS.find(r => r.id === id) || REGIONS[0];
}
