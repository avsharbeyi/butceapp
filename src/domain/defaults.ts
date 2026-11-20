import { convertAmount, DEFAULT_EXCHANGE_RATES, getRateToBase } from './currency';
import { splitInstallmentAmounts } from './money';
import { addDays, addMonthsClamped, parseIsoDate } from './periods';
import type {
  Account,
  Budget,
  Category,
  CurrencyCode,
  Debt,
  ExchangeRate,
  FinanceDataSnapshot,
  InstallmentPlan,
  RecurringRule,
  SavingsGoal,
  Transaction,
  UserSettings,
} from './types';

export const DEFAULT_SETTINGS: UserSettings = {
  baseCurrency: 'TRY',
  theme: 'system',
  privacyMode: false,
  appLockEnabled: false,
  notificationsEnabled: true,
  monthStartDay: 1,
};

interface CategorySeed {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
}

const DEFAULT_CATEGORY_SEEDS: readonly CategorySeed[] = [
  // 7 Gelir Kategorisi
  { id: '00000000-0000-4000-8000-000000000101', name: 'Maaş', type: 'income', icon: 'briefcase', color: '#10B981' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Freelance / Ek İş', type: 'income', icon: 'laptop', color: '#059669' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'Yatırım / Faiz', type: 'income', icon: 'trending-up', color: '#14B8A6' },
  { id: '00000000-0000-4000-8000-000000000104', name: 'Kira Geliri', type: 'income', icon: 'building-2', color: '#06B6D4' },
  { id: '00000000-0000-4000-8000-000000000105', name: 'Alacak Tahsilatı', type: 'income', icon: 'hand-coins', color: '#3B82F6' },
  { id: '00000000-0000-4000-8000-000000000106', name: 'Hediye / İade', type: 'income', icon: 'gift', color: '#8B5CF6' },
  { id: '00000000-0000-4000-8000-000000000107', name: 'Diğer Gelir', type: 'income', icon: 'plus-circle', color: '#22C55E' },

  // 13 Gider Kategorisi
  { id: '00000000-0000-4000-8000-000000000201', name: 'Market', type: 'expense', icon: 'shopping-cart', color: '#EF4444' },
  { id: '00000000-0000-4000-8000-000000000202', name: 'Yeme-İçme', type: 'expense', icon: 'utensils', color: '#F97316' },
  { id: '00000000-0000-4000-8000-000000000203', name: 'Ulaşım / Yakıt', type: 'expense', icon: 'car', color: '#F59E0B' },
  { id: '00000000-0000-4000-8000-000000000204', name: 'Faturalar', type: 'expense', icon: 'receipt', color: '#EAB308' },
  { id: '00000000-0000-4000-8000-000000000205', name: 'Kira / Konut', type: 'expense', icon: 'home', color: '#EC4899' },
  { id: '00000000-0000-4000-8000-000000000206', name: 'Sağlık', type: 'expense', icon: 'heart-pulse', color: '#F43F5E' },
  { id: '00000000-0000-4000-8000-000000000207', name: 'Giyim', type: 'expense', icon: 'shirt', color: '#A855F7' },
  { id: '00000000-0000-4000-8000-000000000208', name: 'Eğlence / Hobi', type: 'expense', icon: 'gamepad-2', color: '#6366F1' },
  { id: '00000000-0000-4000-8000-000000000209', name: 'Abonelikler', type: 'expense', icon: 'repeat', color: '#3B82F6' },
  { id: '00000000-0000-4000-8000-000000000210', name: 'Eğitim', type: 'expense', icon: 'graduation-cap', color: '#0EA5E9' },
  { id: '00000000-0000-4000-8000-000000000211', name: 'Kişisel Bakım', type: 'expense', icon: 'sparkles', color: '#D946EF' },
  { id: '00000000-0000-4000-8000-000000000212', name: 'Borç Ödeme', type: 'expense', icon: 'landmark', color: '#64748B' },
  { id: '00000000-0000-4000-8000-000000000213', name: 'Diğer Gider', type: 'expense', icon: 'tag', color: '#94A3B8' },
];

export function createDefaultExchangeRates(nowIso = new Date().toISOString()): ExchangeRate[] {
  const currencies: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];
  return currencies.map((currencyCode) => ({
    currencyCode,
    rateToTry: DEFAULT_EXCHANGE_RATES[currencyCode],
    source: 'auto',
    updatedAt: nowIso,
  }));
}

export function createDefaultCategories(
  userId: string | null = null,
  nowIso = new Date().toISOString(),
): Category[] {
  let incomeOrder = 0;
  let expenseOrder = 0;

  return DEFAULT_CATEGORY_SEEDS.map((seed) => {
    const sortOrder = seed.type === 'income' ? (incomeOrder += 1) : (expenseOrder += 1);
    return {
      id: seed.id,
      userId,
      name: seed.name,
      type: seed.type,
      icon: seed.icon,
      color: seed.color,
      isDefault: true,
      sortOrder,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
  });
}

function demoUuid(suffix: number): string {
  return `00000000-0000-4000-9000-${String(suffix).padStart(12, '0')}`;
}

/** Builds a rich, self-consistent Turkish demo dataset with every entity flagged `isDemo: true`. */
export function buildDemoDataset(
  anchorDate = new Date().toISOString().slice(0, 10),
): FinanceDataSnapshot {
  parseIsoDate(anchorDate);
  const nowIso = `${anchorDate}T09:00:00.000Z`;
  const rates = { ...DEFAULT_EXCHANGE_RATES };
  const exchangeRates = createDefaultExchangeRates(nowIso);
  const categories = createDefaultCategories(null, nowIso).map((cat) => ({
    ...cat,
    isDemo: true,
  }));

  const catId = (name: string): string => {
    const found = categories.find((c) => c.name === name);
    if (!found) {
      throw new Error(`Demo kategori bulunamadı: ${name}`);
    }
    return found.id;
  };

  const accounts: Account[] = [
    {
      id: demoUuid(1),
      userId: null,
      name: 'Nakit Cüzdan',
      type: 'cash',
      currency: 'TRY',
      initialBalance: 4_500,
      color: '#10B981',
      icon: 'wallet',
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(2),
      userId: null,
      name: 'Vadesiz Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 38_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(3),
      userId: null,
      name: 'Bonus Kredi Kartı',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 0,
      creditLimit: 60_000,
      statementDay: 15,
      dueDay: 25,
      color: '#EF4444',
      icon: 'credit-card',
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(4),
      userId: null,
      name: 'Döviz Hesabı (USD)',
      type: 'investment',
      currency: 'USD',
      initialBalance: 850,
      color: '#F59E0B',
      icon: 'dollar-sign',
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(5),
      userId: null,
      name: 'Altın Hesabı',
      type: 'investment',
      currency: 'XAU',
      initialBalance: 12.5,
      color: '#EAB308',
      icon: 'coins',
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  const [cashAcc, bankAcc, cardAcc] = accounts;
  const currentMonthStart = `${anchorDate.slice(0, 7)}-01`;
  const prevMonthStart = addMonthsClamped(currentMonthStart, -1);
  const currentMonthKey = anchorDate.slice(0, 7);

  const installmentPlanId = demoUuid(101);
  const installmentStart = addDays(currentMonthStart, 4);
  const installmentTotal = 12_000;
  const installmentAmounts = splitInstallmentAmounts(installmentTotal, 3);

  const installmentPlans: InstallmentPlan[] = [
    {
      id: installmentPlanId,
      userId: null,
      title: 'Dizüstü Bilgisayar Aksesuarları',
      accountId: cardAcc.id,
      categoryId: catId('Eğlence / Hobi'),
      totalAmount: installmentTotal,
      currency: 'TRY',
      installmentCount: 3,
      startDate: installmentStart,
      note: '3 taksitli teknoloji alışverişi',
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  const recurringRules: RecurringRule[] = [
    {
      id: demoUuid(201),
      userId: null,
      title: 'Aylık Maaş',
      type: 'income',
      amount: 55_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Maaş'),
      frequency: 'monthly',
      nextRunDate: addMonthsClamped(currentMonthStart, 1),
      autoCreate: true,
      remindDaysBefore: 2,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(202),
      userId: null,
      title: 'Ev Kirası',
      type: 'expense',
      amount: 18_500,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Kira / Konut'),
      frequency: 'monthly',
      nextRunDate: addMonthsClamped(addDays(currentMonthStart, 1), 1),
      autoCreate: true,
      remindDaysBefore: 3,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(203),
      userId: null,
      title: 'Dijital Platform Abonelikleri',
      type: 'expense',
      amount: 420,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Abonelikler'),
      frequency: 'monthly',
      nextRunDate: addMonthsClamped(addDays(currentMonthStart, 7), 1),
      autoCreate: false,
      remindDaysBefore: 2,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  const savingsGoals: SavingsGoal[] = [
    {
      id: demoUuid(301),
      userId: null,
      name: 'Acil Durum Fonu',
      targetAmount: 100_000,
      currentAmount: 15_000,
      currency: 'TRY',
      targetDate: addMonthsClamped(currentMonthStart, 12),
      icon: 'shield-check',
      color: '#10B981',
      isCompleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(302),
      userId: null,
      name: 'Yaz Tatili Birikimi',
      targetAmount: 45_000,
      currentAmount: 5_000,
      currency: 'TRY',
      targetDate: addMonthsClamped(currentMonthStart, 7),
      icon: 'plane',
      color: '#0EA5E9',
      isCompleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  const debts: Debt[] = [
    {
      id: demoUuid(401),
      userId: null,
      personName: 'Ahmet Yılmaz',
      direction: 'owed_to_me',
      totalAmount: 6_000,
      paidAmount: 2_000,
      currency: 'TRY',
      dueDate: addDays(anchorDate, 15),
      note: 'Ortak tatil masrafı paylaşımı',
      isSettled: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(402),
      userId: null,
      personName: 'Zeynep Kaya',
      direction: 'owed_by_me',
      totalAmount: 3_500,
      paidAmount: 0,
      currency: 'TRY',
      dueDate: addDays(anchorDate, 10),
      note: 'Konser bileti ödemesi',
      isSettled: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  const budgets: Budget[] = [
    {
      id: demoUuid(501),
      userId: null,
      categoryId: null,
      month: currentMonthKey,
      limitAmount: 42_000,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(502),
      userId: null,
      categoryId: catId('Market'),
      month: currentMonthKey,
      limitAmount: 8_500,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
    {
      id: demoUuid(503),
      userId: null,
      categoryId: catId('Yeme-İçme'),
      month: currentMonthKey,
      limitAmount: 5_000,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    },
  ];

  let txSeq = 1000;
  const makeTx = (
    partial: Omit<
      Transaction,
      'id' | 'userId' | 'exchangeRateToBase' | 'baseAmount' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDemo' | 'tags'
    > & { tags?: string[] },
  ): Transaction => {
    txSeq += 1;
    const exchangeRateToBase = getRateToBase(partial.currency, 'TRY', rates);
    return {
      ...partial,
      id: demoUuid(txSeq),
      userId: null,
      exchangeRateToBase,
      baseAmount: convertAmount(partial.amount, partial.currency, 'TRY', rates),
      tags: partial.tags ?? [],
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      isDemo: true,
    };
  };

  const transactions: Transaction[] = [
    // Önceki ay işlemleri
    makeTx({
      type: 'income',
      amount: 55_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Maaş'),
      date: prevMonthStart,
      note: 'Geçen ay maaş ödemesi',
      recurringRuleId: recurringRules[0].id,
      tags: ['maaş'],
    }),
    makeTx({
      type: 'expense',
      amount: 18_500,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Kira / Konut'),
      date: addDays(prevMonthStart, 1),
      note: 'Geçen ay ev kirası',
      recurringRuleId: recurringRules[1].id,
      tags: ['kira'],
    }),
    makeTx({
      type: 'expense',
      amount: 6_250,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Market'),
      date: addDays(prevMonthStart, 8),
      note: 'Aylık market alışverişi',
      tags: ['market'],
    }),
    makeTx({
      type: 'expense',
      amount: 2_800,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Yeme-İçme'),
      date: addDays(prevMonthStart, 14),
      note: 'Restoran & kafe',
      tags: ['sosyal'],
    }),
    makeTx({
      type: 'expense',
      amount: 1_950,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Faturalar'),
      date: addDays(prevMonthStart, 18),
      note: 'Elektrik, su, doğalgaz',
      tags: ['fatura'],
    }),

    // Bu ay işlemleri
    makeTx({
      type: 'income',
      amount: 55_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Maaş'),
      date: currentMonthStart,
      note: 'Aylık maaş',
      recurringRuleId: recurringRules[0].id,
      tags: ['maaş'],
    }),
    makeTx({
      type: 'income',
      amount: 8_500,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Freelance / Ek İş'),
      date: addDays(currentMonthStart, 5),
      note: 'Tasarım danışmanlığı',
      tags: ['ek-gelir'],
    }),
    makeTx({
      type: 'expense',
      amount: 18_500,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Kira / Konut'),
      date: addDays(currentMonthStart, 1),
      note: 'Bu ay ev kirası',
      recurringRuleId: recurringRules[1].id,
      tags: ['kira'],
    }),
    makeTx({
      type: 'expense',
      amount: 4_120,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Market'),
      date: addDays(currentMonthStart, 3),
      note: 'Haftalık mutfak alışverişi',
      tags: ['market'],
    }),
    makeTx({
      type: 'expense',
      amount: 1_650,
      currency: 'TRY',
      accountId: cashAcc.id,
      categoryId: catId('Ulaşım / Yakıt'),
      date: addDays(currentMonthStart, 6),
      note: 'Akaryakıt & İstanbulkart',
      tags: ['ulaşım'],
    }),
    makeTx({
      type: 'expense',
      amount: 2_340,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Yeme-İçme'),
      date: addDays(currentMonthStart, 9),
      note: 'Akşam yemeği ve kahve',
      tags: ['yeme-içme'],
    }),
    makeTx({
      type: 'expense',
      amount: 2_180,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Faturalar'),
      date: addDays(currentMonthStart, 11),
      note: 'İnternet, telefon ve elektrik',
      tags: ['fatura'],
    }),
    makeTx({
      type: 'expense',
      amount: 420,
      currency: 'TRY',
      accountId: cardAcc.id,
      categoryId: catId('Abonelikler'),
      date: addDays(currentMonthStart, 7),
      note: 'Müzik & bulut depolama',
      recurringRuleId: recurringRules[2].id,
      tags: ['abonelik'],
    }),

    // Taksitli alışverişin 3 taksiti
    ...installmentAmounts.map((instAmount, index) =>
      makeTx({
        type: 'expense',
        amount: instAmount,
        currency: 'TRY',
        accountId: cardAcc.id,
        categoryId: catId('Eğlence / Hobi'),
        date: addMonthsClamped(installmentStart, index),
        note: `Dizüstü Bilgisayar Aksesuarları (${index + 1}/3)`,
        installmentPlanId,
        installmentNumber: index + 1,
        tags: ['taksit'],
      }),
    ),

    // Transferler (Kredi kartı ödemesi + Kumbaraya aktarım)
    makeTx({
      type: 'transfer',
      amount: 9_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      toAccountId: cardAcc.id,
      toAmount: 9_000,
      categoryId: null,
      date: addDays(currentMonthStart, 12),
      note: 'Kredi kartı dönem borcu ödemesi',
      tags: ['kart-ödeme'],
    }),
    makeTx({
      type: 'transfer',
      amount: 15_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      toAccountId: null,
      categoryId: null,
      goalId: savingsGoals[0].id,
      date: addDays(currentMonthStart, 2),
      note: 'Acil Durum Fonu aktarımı',
      tags: ['birikim'],
    }),
    makeTx({
      type: 'transfer',
      amount: 5_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      toAccountId: null,
      categoryId: null,
      goalId: savingsGoals[1].id,
      date: addDays(currentMonthStart, 10),
      note: 'Yaz tatili kumbara aktarımı',
      tags: ['birikim'],
    }),

    // Borç tahsilatı (Ahmet Yılmaz'dan kısmi ödeme)
    makeTx({
      type: 'income',
      amount: 2_000,
      currency: 'TRY',
      accountId: bankAcc.id,
      categoryId: catId('Alacak Tahsilatı'),
      debtId: debts[0].id,
      date: addDays(currentMonthStart, 13),
      note: 'Ahmet Yılmaz kısmi borç iadesi',
      tags: ['alacak'],
    }),
  ];

  return {
    accounts,
    categories,
    transactions,
    installmentPlans,
    recurringRules,
    budgets,
    savingsGoals,
    debts,
    exchangeRates,
    settings: { ...DEFAULT_SETTINGS },
  };
}
