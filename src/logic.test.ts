import { describe, expect, it } from "vitest";
import { sanitizeBiographyMoment } from "./biography";
import { COMMUTES } from "./commutes";
import { EVENTS } from "./events";
import { HOUSE_TIERS } from "./houses";
import { OCCUPATIONS } from "./occupations";
import { PARTNERS } from "./partners";
import { STAGES } from "./stages";
import {
  HEALTH_MAX,
  IQ_MAX,
  IQ_MIN,
  applyEffects,
  composeHealth,
  formatMoney,
  lifeExpectancy,
} from "./stats";
import { VEHICLES } from "./vehicles";

describe("content graph", () => {
  it("keeps twelve chronological chapters with unique local choices", () => {
    expect(STAGES).toHaveLength(12);
    expect(new Set(STAGES.map((stage) => stage.id)).size).toBe(STAGES.length);
    STAGES.forEach((stage, index) => {
      expect(stage.ageEnd).toBeGreaterThan(stage.ageStart);
      if (index > 0) expect(stage.ageStart).toBe(STAGES[index - 1].ageEnd);
      expect(new Set(stage.options.map((option) => option.id)).size).toBe(stage.options.length);
    });
  });

  it("keeps all option math finite and gamble probabilities valid", () => {
    for (const stage of STAGES) {
      for (const option of stage.options) {
        for (const amount of Object.values(option.effects)) {
          expect(Number.isFinite(amount)).toBe(true);
        }
        for (const amount of [option.cost, option.earn, option.invest, option.ageCost, option.weight]) {
          if (amount !== undefined) expect(Number.isFinite(amount)).toBe(true);
        }
        if (option.gamble) {
          expect(option.gamble.stake).toBeGreaterThanOrEqual(0);
          expect(option.gamble.jackpotChance).toBeGreaterThanOrEqual(0);
          expect(option.gamble.prizeChance).toBeGreaterThanOrEqual(0);
          expect(option.gamble.jackpotChance + option.gamble.prizeChance).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("always offers a fallback career, commute, and partner", () => {
    expect(OCCUPATIONS.some((job) => job.minIq <= IQ_MIN)).toBe(true);
    expect(COMMUTES.some((commute) => commute.cost === 0 && commute.minNet === 0)).toBe(true);
    expect(PARTNERS.some((partner) => partner.requires === undefined)).toBe(true);
  });

  it("keeps purchasable and event data internally valid", () => {
    for (const collection of [HOUSE_TIERS, VEHICLES, OCCUPATIONS, PARTNERS, COMMUTES]) {
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length);
    }
    for (const event of EVENTS) {
      expect(event.weight).toBeGreaterThan(0);
      expect(event.maxAge ?? Infinity).toBeGreaterThanOrEqual(event.minAge ?? 0);
      for (const amount of Object.values(event.effects)) expect(Number.isFinite(amount)).toBe(true);
    }
  });
});

describe("numeric rules", () => {
  it("clamps direct effects to their distinct meter ranges", () => {
    const result = applyEffects(
      { health: 50, happiness: 50, fun: 50, smarts: 100 },
      { health: 1000, happiness: -1000, fun: 1000, smarts: 1000 },
    );
    expect(result).toEqual({ health: HEALTH_MAX, happiness: 0, fun: 100, smarts: IQ_MAX });
  });

  it("keeps composed health and life expectancy within their documented bounds", () => {
    expect(composeHealth(100, 100, 100, 50)).toBeLessThanOrEqual(HEALTH_MAX);
    expect(composeHealth(-100, -100, -100, 100)).toBeGreaterThanOrEqual(0);
    expect(lifeExpectancy(-100, -100, IQ_MIN)).toBeGreaterThanOrEqual(45);
    expect(lifeExpectancy(1000, 1000, IQ_MAX)).toBe(120);
  });

  it("formats unit boundaries without producing 1000k or 1000M", () => {
    expect(formatMoney(999_500)).toBe("$1.0M");
    expect(formatMoney(999_500_000)).toBe("$1.0B");
    expect(formatMoney(-12_000)).toBe("-$12k");
  });
});

describe("biography import safety", () => {
  it("drops unknown fields and non-numeric effects before replay", () => {
    const moment = sanitizeBiographyMoment({
      id: "x",
      label: "Imported",
      icon: "📌",
      desc: "A memory",
      category: "not-a-category",
      person: "not-a-person",
      effects: { health: "lots", happiness: 8, smarts: Infinity },
      earn: "money",
      gamble: { stake: -1 },
      opensHousePicker: true,
    });
    expect(moment).toEqual({
      id: "x",
      label: "Imported",
      icon: "📌",
      desc: "A memory",
      category: "special",
      effects: { happiness: 8 },
      storyTag: "bio_moment",
    });
  });

  it("clamps extreme imported numeric values", () => {
    const moment = sanitizeBiographyMoment({
      effects: { health: 1e20, smarts: -1e20 },
      earn: 1e30,
    });
    expect(moment.effects).toEqual({ health: 100, smarts: -100 });
    expect(moment.earn).toBe(1_000_000_000);
  });
});
