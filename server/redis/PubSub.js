// ============================================================
// REDIS PUB/SUB — horizontal scaling
// ============================================================
import Redis from 'ioredis';

let publisher = null;
let subscriber = null;
let connected = false;

export async function connectRedis() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL not set');

  publisher = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  subscriber = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });

  await publisher.connect();
  await subscriber.connect();
  connected = true;

  console.log('[Redis] Connected');

  publisher.on('error', (err) => console.error('[Redis] Publisher error:', err.message));
  subscriber.on('error', (err) => console.error('[Redis] Subscriber error:', err.message));

  return { publisher, subscriber };
}

// Publish game event to all server instances
export async function publishEvent(channel, data) {
  if (!publisher || !connected) return;
  try {
    await publisher.publish(channel, JSON.stringify(data));
  } catch (e) {
    console.warn('[Redis] publishEvent failed:', e.message);
  }
}

// Subscribe to game events from other instances
export function subscribeToChannel(channel, handler) {
  if (!subscriber || !connected) return;
  subscriber.subscribe(channel, (err) => {
    if (err) console.error('[Redis] subscribe error:', err);
  });
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      try { handler(JSON.parse(message)); }
      catch (e) { console.warn('[Redis] message parse error:', e.message); }
    }
  });
}

// Cross-instance player lookup (for spectating across instances)
export async function setPlayerInstance(playerId, instanceId) {
  if (!publisher) return;
  await publisher.setex(`player:${playerId}:instance`, 300, instanceId);
}

export async function getPlayerInstance(playerId) {
  if (!publisher) return null;
  return await publisher.get(`player:${playerId}:instance`);
}

export function isRedisConnected() { return connected; }
