// ============================================================
// MONGODB CONNECTION
// ============================================================
import mongoose from 'mongoose';

let connected = false;

export async function connectMongo() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri, {
    dbName: 'battle_royale',
    serverSelectionTimeoutMS: 5000,
  });

  connected = true;
  console.log('[DB] MongoDB connected');

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
    connected = false;
  });
}

export { mongoose };
