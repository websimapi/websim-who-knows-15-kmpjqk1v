// Render a little behind the network so positions and look directions can
// move smoothly between host snapshots. Keep discrete world state from the
// newer frame while blending only the continuous character fields.
// Game input prediction only edits character rows; keep the larger world
// arrays shared and copy just the rows that interpolation can change.
const clone = (snapshot) => ({ ...snapshot, chars: snapshot.chars.map((row) => row.slice()) });

export function interpolateSnapshot(frames, now, delayMs = 150) {
  if (!frames.length) return null;
  const at = now - delayMs;
  if (frames.length === 1 || at <= frames[0].t) return clone(frames[0].s);
  const last = frames[frames.length - 1];
  if (at >= last.t) return clone(last.s);
  for (let i = frames.length - 2; i >= 0; i--) {
    const a = frames[i], b = frames[i + 1];
    if (at < a.t) continue;
    const f = Math.max(0, Math.min(1, (at - a.t) / Math.max(1, b.t - a.t)));
    const out = clone(b.s);
    const previous = new Map(a.s.chars.map((row) => [row[0], row]));
    for (const row of out.chars) {
      const old = previous.get(row[0]);
      if (!old || old[5] !== row[5] || old[9] !== row[9] || Math.hypot(row[1] - old[1], row[2] - old[2]) > 4) continue;
      row[1] = old[1] + (row[1] - old[1]) * f;
      row[2] = old[2] + (row[2] - old[2]) * f;
      let turn = row[3] - old[3]; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      row[3] = old[3] + turn * f;
      row[4] = old[4] + (row[4] - old[4]) * f;
      row[12] = (old[12] || 0) + ((row[12] || 0) - (old[12] || 0)) * f;
    }
    return out;
  }
  return clone(last.s);
}
