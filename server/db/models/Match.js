// ============================================================
// MATCH DB MODEL
// ============================================================
import { mongoose } from '../mongoose.js';

const matchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true, index: true },
  mode: { type: String, enum: ['SOLO', 'DUO', 'SQUAD'], required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date },
  duration: { type: Number }, // seconds
  region: { type: String, default: 'us-east' },
  playerCount: { type: Number },
  winnerId: { type: String },
  winnerName: { type: String },
  players: [{
    playerId: String,
    name: String,
    placement: Number,
    kills: Number,
    damageDealt: Number,
    survivalTime: Number,
    eloChange: Number,
  }],
}, { versionKey: false });

matchSchema.index({ startedAt: -1 });
matchSchema.index({ 'players.playerId': 1 });

export const MatchModel = mongoose.model('Match', matchSchema);
