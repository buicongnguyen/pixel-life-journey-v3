import { describe, expect, it } from "vitest";
import { chapterChallenge } from "./challenges";
import { STAGES } from "./stages";
import { applyEffects, weightStatus, weightHealthDrain } from "./stats";
import type { HistoryEntry } from "./types";

const stage = STAGES[0];
const entry = (optionId: string, stageId = stage.id): HistoryEntry => ({
  stageId, stageName: "Test", optionId, ageAt: 0.5,
});

describe("chapter challenges", () => {
  it("requires distinct choices and ignores other chapters and invalid ids", () => {
    const first = stage.options.find(o => o.id === "milk") ?? stage.options[0];
    expect(chapterChallenge(stage, [entry(first.id), entry(first.id), entry("missing"), entry(first.id, "other")]).count).toBe(1);
  });
  it("excludes harmful choices, gambling and pickers", () => {
    const custom = { ...stage, options: [
      { ...stage.options[0], id: "harmful", effects: { health: -1, fun: 5 } },
      { ...stage.options[0], id: "picker", opensHousePicker: true },
    ] };
    expect(chapterChallenge(custom, custom.options.map(o => entry(o.id)))).toMatchObject({ target: 0, complete: false, count: 0 });
  });
  it("restores progress by deriving it from rewound history", () => {
    const history = stage.options.map(o => entry(o.id));
    expect(chapterChallenge(stage, history).complete).toBe(true);
    expect(chapterChallenge(stage, []).count).toBe(0);
    for (const chapter of STAGES) expect(chapterChallenge(chapter, []).target).toBeGreaterThan(0);
  });
});

describe("consistent meter boundaries", () => {
  it("does not erase exceptional health when applying a small change", () => {
    expect(applyEffects({ health: 112, happiness: 50, fun: 50, smarts: 100 }, { health: 1 }).health).toBe(113);
  });
  it("labels the exact penalty-free weight interval as healthy", () => {
    for (let w = 0; w <= 100; w++) {
      expect(weightStatus(w) === "healthy").toBe(weightHealthDrain(w) === 0);
    }
  });
});
