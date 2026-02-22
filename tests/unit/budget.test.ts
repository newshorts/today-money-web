import { describe, expect, it } from "vitest";

import { calculateBudgetState } from "@/lib/budget";

describe("budget distribution", () => {
  it("keeps cent-exact daily distribution with remainder", () => {
    const discretionary = 1001;
    const days = 30;

    const base = Math.floor(discretionary / days);
    const remainder = discretionary - base * days;

    let total = 0;
    for (let d = 1; d <= days; d += 1) {
      total += base + (d <= remainder ? 1 : 0);
    }

    expect(total).toBe(discretionary);
  });

  it("calculates tomorrow preview from remaining today", () => {
    const state = calculateBudgetState({
      discretionaryCents: 30000,
      daysInMonth: 30,
      todayIndex: 10,
      spentBeforeTodayCents: 9000,
      spentTodayCents: 500,
      nextMonthDays: 31,
    });

    expect(state.allowanceTodayCents).toBe(1000);
    expect(state.remainingTodayCents).toBe(500);
    expect(state.tomorrowPreviewCents).toBe(1500);
  });

  it("supports negative discretionary totals", () => {
    const state = calculateBudgetState({
      discretionaryCents: -30000,
      daysInMonth: 30,
      todayIndex: 10,
      spentBeforeTodayCents: 0,
      spentTodayCents: 0,
      nextMonthDays: 31,
    });

    expect(state.allowanceTodayCents).toBeLessThan(0);
    expect(state.remainingTodayCents).toBeLessThan(0);
  });

  it("uses next-month allowance on the last day", () => {
    const state = calculateBudgetState({
      discretionaryCents: 28000,
      daysInMonth: 28,
      todayIndex: 28,
      spentBeforeTodayCents: 25000,
      spentTodayCents: 500,
      nextMonthDays: 31,
    });

    expect(state.remainingTodayCents).toBe(2500);
    expect(state.tomorrowPreviewCents).toBe(3404);
  });
});
