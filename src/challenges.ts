import type { HistoryEntry, Stage } from "./types";

/** Cosmetic progress only: history is already restored by time travel. */
export function chapterChallenge(stage: Stage, history: readonly HistoryEntry[]) {
  const eligible = new Set(stage.options.filter(o =>
    !o.opensCareerDesk && !o.opensHousePicker && !o.opensVehiclePicker &&
    !o.gamble && Object.values(o.effects).some(v => v > 0) &&
    Object.values(o.effects).every(v => v >= 0)
  ).map(o => o.id));
  const target = Math.min(3, eligible.size);
  const done = new Set(history.filter(h => h.stageId === stage.id && eligible.has(h.optionId)).map(h => h.optionId));
  return {
    count: Math.min(target, done.size), target,
    complete: target > 0 && done.size >= target,
    suggestion: stage.options.find(o => eligible.has(o.id) && !done.has(o.id))?.label,
  };
}
