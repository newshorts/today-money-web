import { DateTime } from "luxon";
import type { AmountSource, BudgetProfile, BudgetImpact, HiddenReason, Transaction } from "@prisma/client";

import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toDateOnly } from "@/lib/date";

export type BudgetProfileResponse = {
  currency: "USD";
  incomeMonthlyCents: number;
  fixedMonthlyCents: number;
  sourceIncome: AmountSource;
  sourceFixed: AmountSource;
};

export async function getOrCreateBudgetProfile(userId: string): Promise<BudgetProfile> {
  const existing = await prisma.budgetProfile.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.budgetProfile.create({
    data: {
      userId,
      currency: "USD",
      incomeMonthlyCents: 0n,
      fixedMonthlyCents: 0n,
      sourceIncome: "USER_OVERRIDDEN",
      sourceFixed: "USER_OVERRIDDEN",
    },
  });
}

export function budgetProfileToResponse(profile: BudgetProfile): BudgetProfileResponse {
  return {
    currency: "USD",
    incomeMonthlyCents: Number(profile.incomeMonthlyCents),
    fixedMonthlyCents: Number(profile.fixedMonthlyCents),
    sourceIncome: profile.sourceIncome,
    sourceFixed: profile.sourceFixed,
  };
}

export async function setBudgetProfile(
  userId: string,
  params: {
    incomeMonthlyCents: number;
    fixedMonthlyCents: number;
    sourceIncome: AmountSource;
    sourceFixed: AmountSource;
  },
): Promise<BudgetProfile> {
  return prisma.budgetProfile.upsert({
    where: { userId },
    create: {
      userId,
      currency: "USD",
      incomeMonthlyCents: BigInt(params.incomeMonthlyCents),
      fixedMonthlyCents: BigInt(params.fixedMonthlyCents),
      sourceIncome: params.sourceIncome,
      sourceFixed: params.sourceFixed,
    },
    update: {
      incomeMonthlyCents: BigInt(params.incomeMonthlyCents),
      fixedMonthlyCents: BigInt(params.fixedMonthlyCents),
      sourceIncome: params.sourceIncome,
      sourceFixed: params.sourceFixed,
    },
  });
}

export async function computeBudgetSummary(userId: string): Promise<{
  date: string;
  timezone: string;
  currency: "USD";
  incomeMonthlyCents: number;
  fixedMonthlyCents: number;
  discretionaryMonthlyCents: number;
  daysInMonth: number;
  allowanceTodayCents: number;
  availableStartOfDayCents: number;
  spentTodayCents: number;
  remainingTodayCents: number;
  tomorrowPreviewCents: number;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }

  const timezone = user.timezone || DEFAULT_TIMEZONE;
  const now = DateTime.now().setZone(timezone);

  const monthStart = now.startOf("month");
  const monthEnd = now.endOf("month");
  const daysInMonth = now.daysInMonth ?? 30;
  const todayIndex = now.day;

  const profile = await getOrCreateBudgetProfile(userId);

  const discretionary = Number(profile.incomeMonthlyCents - profile.fixedMonthlyCents);

  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      effectiveDate: {
        gte: monthStart.toUTC().toJSDate(),
        lte: monthEnd.toUTC().toJSDate(),
      },
      isHidden: false,
      isRemovedByPlaid: false,
      isSuperseded: false,
      budgetImpact: "VARIABLE",
    },
    orderBy: { effectiveDate: "asc" },
  });

  const todayDate = now.toISODate() ?? now.toFormat("yyyy-LL-dd");

  let spentBeforeToday = 0;
  let spentToday = 0;

  for (const tx of txns) {
    const txDay = toDateOnly(tx.effectiveDate, timezone);
    const amount = Number(tx.amountCents);

    if (txDay < todayDate) {
      spentBeforeToday += amount;
      continue;
    }

    if (txDay === todayDate) {
      spentToday += amount;
    }
  }

  const computed = calculateBudgetState({
    discretionaryCents: discretionary,
    daysInMonth,
    todayIndex,
    spentBeforeTodayCents: spentBeforeToday,
    spentTodayCents: spentToday,
    nextMonthDays: now.plus({ month: 1 }).daysInMonth ?? daysInMonth,
  });

  return {
    date: todayDate,
    timezone,
    currency: "USD",
    incomeMonthlyCents: Number(profile.incomeMonthlyCents),
    fixedMonthlyCents: Number(profile.fixedMonthlyCents),
    discretionaryMonthlyCents: discretionary,
    daysInMonth,
    allowanceTodayCents: computed.allowanceTodayCents,
    availableStartOfDayCents: computed.availableStartOfDayCents,
    spentTodayCents: spentToday,
    remainingTodayCents: computed.remainingTodayCents,
    tomorrowPreviewCents: computed.tomorrowPreviewCents,
  };
}

export function calculateBudgetState(params: {
  discretionaryCents: number;
  daysInMonth: number;
  todayIndex: number;
  spentBeforeTodayCents: number;
  spentTodayCents: number;
  nextMonthDays: number;
}): {
  allowanceTodayCents: number;
  availableStartOfDayCents: number;
  remainingTodayCents: number;
  tomorrowPreviewCents: number;
} {
  const base = Math.floor(params.discretionaryCents / params.daysInMonth);
  const remainder = params.discretionaryCents - base * params.daysInMonth;

  const allowanceToday = allowanceForDay(base, remainder, params.todayIndex);
  const accruedToDate = base * params.todayIndex + Math.min(params.todayIndex, remainder);

  const availableStartOfDay = accruedToDate - params.spentBeforeTodayCents;
  const remainingToday = availableStartOfDay - params.spentTodayCents;

  const tomorrowPreview =
    params.todayIndex < params.daysInMonth
      ? allowanceForDay(base, remainder, params.todayIndex + 1) + remainingToday
      : allowanceForNextMonth(params.discretionaryCents, params.nextMonthDays) + remainingToday;

  return {
    allowanceTodayCents: allowanceToday,
    availableStartOfDayCents: availableStartOfDay,
    remainingTodayCents: remainingToday,
    tomorrowPreviewCents: tomorrowPreview,
  };
}

function allowanceForDay(base: number, remainder: number, dayIndex: number): number {
  return base + (dayIndex <= remainder ? 1 : 0);
}

function allowanceForNextMonth(discretionary: number, daysInNextMonth: number): number {
  const base = Math.floor(discretionary / daysInNextMonth);
  const remainder = discretionary - base * daysInNextMonth;
  return allowanceForDay(base, remainder, 1);
}

export function serializeTransaction(
  tx: Transaction & {
    budgetImpact: BudgetImpact;
    hiddenReason: HiddenReason | null;
  },
  timezone: string,
): {
  id: string;
  source: "PLAID" | "MANUAL";
  date: string;
  authorizedDate: string | null;
  effectiveDate: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  currency: "USD";
  pending: boolean;
  budgetImpact: BudgetImpact;
  isHidden: boolean;
  userOverrideImpact: boolean;
} {
  return {
    id: tx.id,
    source: tx.source,
    date: toDateOnly(tx.date, timezone),
    authorizedDate: tx.authorizedDate ? toDateOnly(tx.authorizedDate, timezone) : null,
    effectiveDate: toDateOnly(tx.effectiveDate, timezone),
    name: tx.name,
    merchantName: tx.merchantName,
    amountCents: Number(tx.amountCents),
    currency: "USD",
    pending: tx.pending,
    budgetImpact: tx.budgetImpact,
    isHidden: tx.isHidden,
    userOverrideImpact: tx.userOverrideImpact,
  };
}
