import { describe, expect, it, vi } from "vitest";
import { Game } from "./engine";
import { STAGES } from "./stages";

// Exercise real orchestration methods without starting the DOM/animation loop.
// Only presentation and incidental sampling are stubbed at these boundaries.
const harness = () => Object.assign(Object.create(Game.prototype), {
  biography: null, stageIndex: 9, occupation: null, commute: null, partner: null,
  showOccupation: vi.fn(), showCommute: vi.fn(), showPartner: vi.fn(),
  buildStations: vi.fn(), renderFocusPanel: vi.fn(), clearOverlay: vi.fn(),
});

describe("required choices", () => {
  it("orders late-start career, commute, partner, then play", () => {
    const game = harness();
    game.enterRequiredStageChoice();
    expect(game.mode).toBe("occupation");
    game.occupation = { id: "artist" };
    game.enterRequiredStageChoice();
    expect(game.mode).toBe("commute");
    game.commute = "walk";
    game.enterRequiredStageChoice();
    expect(game.mode).toBe("partner");
    game.partner = { id: "aria" };
    game.enterRequiredStageChoice();
    expect(game.mode).toBe("playing");
    expect(game.buildStations).toHaveBeenCalledOnce();
  });
  it("does not force career or marriage onto a biography", () => {
    const game = harness(); game.biography = { id: "bio" };
    game.enterRequiredStageChoice();
    expect(game.mode).toBe("playing");
    expect(game.showOccupation).not.toHaveBeenCalled();
    expect(game.showPartner).not.toHaveBeenCalled();
  });
});

describe("training mortality", () => {
  it("cannot continue training beyond the same lifespan limit as normal play", () => {
    const game = Object.assign(harness(), {
      age: 89.95, stats: { health: 90 }, stageStep: () => 1, lifeExp: () => 90,
      passiveTick: vi.fn(), sampleHealth: vi.fn(), renderHud: vi.fn(), finishLife: vi.fn(),
    });
    expect(game.spendTrainingMoment()).toBe(false);
    expect(game.finishLife).toHaveBeenCalledWith("natural", 90);
  });
  it("samples time spent and stops the training overlay after death", () => {
    const game = Object.assign(harness(), {
      age: 80, stats: { health: 0 }, stageStep: () => 1,
      passiveTick: vi.fn(), sampleHealth: vi.fn(), renderHud: vi.fn(), finishLife: vi.fn(),
    });
    expect(game.spendTrainingMoment()).toBe(false);
    expect(game.age).toBeCloseTo(80.16);
    expect(game.sampleHealth).toHaveBeenCalledOnce();
    expect(game.finishLife).toHaveBeenCalledWith("health", 80);
  });
});

describe("rewind branch consistency", () => {
  it("restores one-off and training progress and discards the abandoned future", () => {
    const snap = {
      stats: {}, age: 22, homeIds: [], homePurchaseAges: [], owned: [], jobsTaken: [],
      inventory: [], familyMembers: [], familyEdges: [], familyHiddenIds: [],
      usedEvents: [], eventsLog: [], historyLen: 1,
      usedOnce: ["one-off"], trainingQuestionIndex: { iq: 2, eq: 3, strategy: 1 },
      trainingLevel: { iq: "starter", eq: "starter", strategy: "starter" },
    };
    const game = Object.assign(harness(), {
      timeline: [snap, snap, { ...snap, age: 36 }], history: [1, 2, 3],
      recomputeHomes: vi.fn(), loadStage: vi.fn(), hint: vi.fn(),
    });
    game.rewind(1);
    expect(game.timeline).toHaveLength(2);
    expect(game.history).toEqual([1]);
    expect([...game.usedOnce]).toEqual(["one-off"]);
    expect(game.trainingQuestionIndex).toEqual(snap.trainingQuestionIndex);
    expect(game.loadStage).toHaveBeenCalledWith(1, true);
  });
});

describe("new life at a chosen age", () => {
  it("initializes adult learning before required career eligibility is checked", () => {
    const game = Object.assign(harness(), {
      setupFamilyFund: 10000, rollParentSupport: () => 0, recomputeHealth: vi.fn(),
      resetFamilyGraph: vi.fn(), renderInventory: vi.fn(), loadStage: vi.fn(),
      hint: vi.fn(), heritageLabel: () => "Test", lifeSpeedLabel: () => "1x",
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      game.newGame(false, STAGES.findIndex(s => s.id === "career"));
      expect(game.stats.smarts).toBe(game.iqCeiling);
      expect(game.stats.smarts).toBeGreaterThan(60);
      game.newGame(false, 0);
      expect(game.stats.smarts).toBe(60);
    } finally { random.mockRestore(); }
  });
});
