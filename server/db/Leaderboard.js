// ============================================================
// LEADERBOARD QUERIES
// ============================================================
import { PlayerModel } from './models/Player.js';
import { MatchModel } from './models/Match.js';
import { ELO_DEFAULT, ELO_K_FACTOR } from 'battle-royale-shared';

export async function getLeaderboard(limit = 20) {
  try {
    return await PlayerModel
      .find({}, { name: 1, elo: 1, totalKills: 1, totalWins: 1, totalMatches: 1 })
      .sort({ elo: -1 })
      .limit(limit)
      .lean();
  } catch {
    return [];
  }
}

export async function getMatchHistory(playerId, limit = 10) {
  try {
    return await MatchModel
      .find({ 'players.playerId': playerId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();
  } catch {
    return [];
  }
}

export async function updatePlayerStats(playerId, name, matchResult) {
  try {
    const { placement, kills, damageDealt, survivalTime, totalPlayers } = matchResult;
    const isWin = placement === 1;

    await PlayerModel.findOneAndUpdate(
      { playerId },
      {
        $setOnInsert: { playerId, name, elo: ELO_DEFAULT },
        $inc: {
          totalKills: kills || 0,
          totalDeaths: placement > 1 ? 1 : 0,
          totalWins: isWin ? 1 : 0,
          totalMatches: 1,
          totalDamageDealt: damageDealt || 0,
        },
        $min: { bestPlacement: placement },
        $max: { longestSurvival: survivalTime || 0 },
        $set: { lastSeenAt: new Date(), name },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.warn('[DB] updatePlayerStats failed:', e.message);
  }
}

// ELO calculation
export function calculateEloChange(playerElo, opponentAverageElo, placement, totalPlayers) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentAverageElo - playerElo) / 400));
  const actualScore = 1 - ((placement - 1) / (totalPlayers - 1));
  return Math.round(ELO_K_FACTOR * (actualScore - expectedScore));
}

export async function saveMatch(matchData) {
  try {
    await MatchModel.create(matchData);
  } catch (e) {
    console.warn('[DB] saveMatch failed:', e.message);
  }
}
