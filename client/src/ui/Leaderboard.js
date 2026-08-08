// ============================================================
// LEADERBOARD UI
// ============================================================
export class Leaderboard {
  constructor() {
    this.$tbody = document.getElementById('lb-body');
  }

  render(entries) {
    if (!this.$tbody) return;
    this.$tbody.innerHTML = '';
    entries.forEach((entry, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${i + 1}</td>
        <td>${this._escape(entry.name)}</td>
        <td>${entry.elo || 1000}</td>
        <td>${entry.totalWins || 0}</td>
        <td>${entry.totalKills || 0}</td>
      `;
      this.$tbody.appendChild(tr);
    });
    if (entries.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" style="text-align:center;color:#555">No data yet — be the first!</td>';
      this.$tbody.appendChild(tr);
    }
  }

  _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
