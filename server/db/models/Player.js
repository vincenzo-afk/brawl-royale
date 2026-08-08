// ============================================================
// PLAYER DB MODEL
// ============================================================
import { mongoose } from '../mongoose.js';
import { ELO_DEFAULT } from 'battle-royale-shared';

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, maxlength: 20 },
  skin: { type: Number, default: 0 },
  elo: { type: Number, default: ELO_DEFAULT },
  // Career stats
  totalKills: { type: Number, default: 0 },
  totalDeaths: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalMatches: { type: Number, default: 0 },
  totalDamageDealt: { type: Number, default: 0 },
  bestPlacement: { type: Number, default: 999 },
  longestSurvival: { type: Number, default: 0 }, // seconds
  // Meta
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  region: { type: String, default: 'us-east' },
}, { versionKey: false });

playerSchema.index({ elo: -1 });
playerSchema.index({ totalKills: -1 });

export const PlayerModel = mongoose.model('Player', playerSchema);
