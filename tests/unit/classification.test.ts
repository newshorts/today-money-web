import { describe, expect, it } from "vitest";

import { defaultBudgetImpact, isTransferLike } from "@/lib/classification";

describe("transaction classification", () => {
  it("excludes transfers", () => {
    const tx = {
      amount: 35,
      personal_finance_category: { primary: "TRANSFER_OUT" },
    };

    expect(isTransferLike(tx)).toBe(true);
    expect(defaultBudgetImpact(tx, 3500n)).toBe("TRANSFER_EXCLUDED");
  });

  it("defaults refunds to income excluded", () => {
    const tx = {
      amount: -20,
      personal_finance_category: { primary: "GENERAL_SERVICES" },
    };

    expect(defaultBudgetImpact(tx, -2000n)).toBe("INCOME_EXCLUDED");
  });

  it("treats normal positive spend as variable", () => {
    const tx = {
      amount: 20,
      personal_finance_category: { primary: "GENERAL_MERCHANDISE" },
    };

    expect(defaultBudgetImpact(tx, 2000n)).toBe("VARIABLE");
  });

  it("does not change classification for pending by itself", () => {
    const tx = {
      amount: 9,
      personal_finance_category: { primary: "GENERAL_MERCHANDISE" },
      pending: true,
    };

    expect(defaultBudgetImpact(tx, 900n)).toBe("VARIABLE");
  });
});
