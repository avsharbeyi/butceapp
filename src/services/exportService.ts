import { DEFAULT_SETTINGS } from '@/domain/defaults';
import { formatMoney, formatPercent } from '@/domain/money';
import type {
  Account,
  Category,
  FinanceDataSnapshot,
  ReportSnapshot,
  Transaction,
  TransactionType,
} from '@/domain/types';

const CSV_BOM = '\uFEFF';
const CSV_HEADERS =
  'Tarih,Tür,Tutar,Para Birimi,Ana Para Birimi Tutarı,Hesap,Hedef Hesap,Kategori,Not,Etiketler';
const FORMULA_TRIGGER_RE = /^[ \t\r\n]*[=+\-@]/;

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Gelir',
  expense: 'Gider',
  transfer: 'Transfer',
};

/**
 * Neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@` after optional whitespace/tabs)
 * and applies RFC 4180 CSV quoting for commas, quotes, and newlines.
 */
export function sanitizeCsvCell(value: string): string {
  const raw = String(value ?? '');
  const neutralized = FORMULA_TRIGGER_RE.test(raw) ? `'${raw}` : raw;

  if (
    neutralized.includes(',') ||
    neutralized.includes('"') ||
    neutralized.includes('\n') ||
    neutralized.includes('\r')
  ) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV export of active transactions
 * with Turkish headers and formula-injection protection.
 */
export function generateTransactionsCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
): string {
  const accountNames = new Map(accounts.map((acc) => [acc.id, acc.name]));
  const categoryNames = new Map(categories.map((cat) => [cat.id, cat.name]));

  const activeSorted = transactions
    .filter((tx) => tx.deletedAt === null)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const rows = activeSorted.map((tx) => {
    const accountName = accountNames.get(tx.accountId) ?? '';
    const toAccountName = tx.toAccountId ? (accountNames.get(tx.toAccountId) ?? '') : '';
    const categoryName = tx.categoryId
      ? (categoryNames.get(tx.categoryId) ?? 'Kategorisiz')
      : tx.type === 'transfer'
        ? ''
        : 'Kategorisiz';

    const cells = [
      tx.date,
      TX_TYPE_LABELS[tx.type],
      tx.amount.toFixed(2),
      tx.currency,
      tx.baseAmount.toFixed(2),
      accountName,
      toAccountName,
      categoryName,
      tx.note ?? '',
      tx.tags.join('; '),
    ];

    return cells.map((cell) => sanitizeCsvCell(cell)).join(',');
  });

  return `${CSV_BOM}${[CSV_HEADERS, ...rows].join('\r\n')}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates a print-ready Turkish HTML report for `expo-print` or `window.print()`.
 * Respects `snapshot.includeTransactions` and `snapshot.includeNotes` privacy flags.
 */
export function generateReportHtml(snapshot: ReportSnapshot): string {
  const { kpis, baseCurrency } = snapshot;

  const expenseRows = snapshot.expenseBreakdown
    .map(
      (item) => `
      <tr>
        <td><span class="dot" style="background:${escapeHtml(item.color)}"></span>${escapeHtml(item.name)}</td>
        <td class="num">${item.count}</td>
        <td class="num">${escapeHtml(formatPercent(item.sharePct))}</td>
        <td class="num">${escapeHtml(formatMoney(item.amount, baseCurrency))}</td>
      </tr>`,
    )
    .join('');

  const budgetRows = snapshot.budgetProgress
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.categoryName)}</td>
        <td class="num">${escapeHtml(formatMoney(item.spent, item.budget.currency))}</td>
        <td class="num">${escapeHtml(formatMoney(item.limit, item.budget.currency))}</td>
        <td class="num">${escapeHtml(formatPercent(item.pct))}</td>
      </tr>`,
    )
    .join('');

  const txSection =
    snapshot.includeTransactions && snapshot.transactions.length > 0
      ? `
      <section>
        <h2>İşlem Listesi (${snapshot.transactions.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tür</th>
              <th>Kategori</th>
              ${snapshot.includeNotes ? '<th>Not</th>' : ''}
              <th class="num">Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${snapshot.transactions
              .map(
                (tx) => `
              <tr>
                <td>${escapeHtml(tx.date)}</td>
                <td>${escapeHtml(TX_TYPE_LABELS[tx.type])}</td>
                <td>${escapeHtml(tx.categoryName)}</td>
                ${snapshot.includeNotes ? `<td>${escapeHtml(tx.note ?? '—')}</td>` : ''}
                <td class="num">${escapeHtml(formatMoney(tx.baseAmount, baseCurrency))}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(snapshot.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; margin: 28px; line-height: 1.5; }
    header { border-bottom: 2px solid #E2E8F0; padding-bottom: 14px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin: 0 0 4px 0; }
    .meta { color: #64748B; font-size: 13px; }
    h2 { font-size: 16px; margin: 22px 0 10px 0; color: #1E293B; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: left; }
    th { background: #F8FAFC; color: #475569; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 7px; }
    .income { color: #059669; font-weight: 600; }
    .expense { color: #DC2626; font-weight: 600; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(snapshot.title)}</h1>
    <div class="meta">Dönem: ${escapeHtml(snapshot.range.startDate)} – ${escapeHtml(snapshot.range.endDate)} · Oluşturulma: ${escapeHtml(snapshot.generatedAt.slice(0, 10))}</div>
  </header>

  <section>
    <h2>Dönem Özeti (KPI)</h2>
    <table>
      <tbody>
        <tr><th>Toplam Gelir</th><td class="num income">${escapeHtml(formatMoney(kpis.totalIncome, baseCurrency))}</td></tr>
        <tr><th>Toplam Gider</th><td class="num expense">${escapeHtml(formatMoney(kpis.totalExpense, baseCurrency))}</td></tr>
        <tr><th>Net Nakit Akışı</th><td class="num">${escapeHtml(formatMoney(kpis.netCashFlow, baseCurrency))}</td></tr>
        <tr><th>Tasarruf Oranı</th><td class="num">${escapeHtml(formatPercent(kpis.savingsRate))}</td></tr>
        <tr><th>Günlük Ortalama Gider</th><td class="num">${escapeHtml(formatMoney(kpis.dailyAverageExpense, baseCurrency))}</td></tr>
      </tbody>
    </table>
  </section>

  ${
    expenseRows
      ? `<section>
    <h2>Kategori Dağılımı (Gider)</h2>
    <table>
      <thead>
        <tr><th>Kategori</th><th class="num">İşlem</th><th class="num">Pay</th><th class="num">Tutar</th></tr>
      </thead>
      <tbody>${expenseRows}</tbody>
    </table>
  </section>`
      : ''
  }

  ${
    budgetRows
      ? `<section>
    <h2>Bütçe Durumu</h2>
    <table>
      <thead>
        <tr><th>Bütçe</th><th class="num">Harcanan</th><th class="num">Limit</th><th class="num">Doluluk</th></tr>
      </thead>
      <tbody>${budgetRows}</tbody>
    </table>
  </section>`
      : ''
  }

  ${txSection}
</body>
</html>`;
}

interface BackupEnvelope {
  schemaVersion: number;
  exportedAt: string;
  data: FinanceDataSnapshot;
}

/**
 * Exports structural finance state as pretty JSON, stripping binary/local receipt URIs.
 */
export function exportBackupJson(state: FinanceDataSnapshot): string {
  const sanitized: FinanceDataSnapshot = {
    accounts: state.accounts,
    categories: state.categories,
    transactions: state.transactions.map((tx) => ({
      ...tx,
      receiptUri: null,
    })),
    installmentPlans: state.installmentPlans,
    recurringRules: state.recurringRules,
    budgets: state.budgets,
    savingsGoals: state.savingsGoals,
    debts: state.debts,
    exchangeRates: state.exchangeRates,
    settings: state.settings,
  };

  const envelope: BackupEnvelope = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: sanitized,
  };

  return JSON.stringify(envelope, null, 2);
}

const REQUIRED_SNAPSHOT_ARRAYS: ReadonlyArray<keyof FinanceDataSnapshot> = [
  'accounts',
  'categories',
  'transactions',
  'installmentPlans',
  'recurringRules',
  'budgets',
  'savingsGoals',
  'debts',
  'exchangeRates',
];

/**
 * Validates and parses a JSON backup string into a `FinanceDataSnapshot`,
 * throwing a descriptive Turkish error if the payload is malformed.
 */
export function parseBackupJson(raw: string): FinanceDataSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Yedek dosyası geçerli bir JSON formatında değil.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Yedek dosyası geçersiz bir kök nesne içeriyor.');
  }

  const envelope = parsed as Partial<BackupEnvelope>;
  if (envelope.schemaVersion !== 1) {
    throw new Error('Desteklenmeyen yedek sürümü. Yalnızca şema v1 desteklenir.');
  }

  const data = envelope.data as Partial<FinanceDataSnapshot> | undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Yedek dosyasında "data" alanı eksik veya geçersiz.');
  }

  for (const key of REQUIRED_SNAPSHOT_ARRAYS) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Yedek dosyasında "${key}" listesi eksik veya geçersiz.`);
    }
  }

  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
    throw new Error('Yedek dosyasında kullanıcı ayarları ("settings") eksik.');
  }

  return {
    accounts: data.accounts!,
    categories: data.categories!,
    transactions: data.transactions!,
    installmentPlans: data.installmentPlans!,
    recurringRules: data.recurringRules!,
    budgets: data.budgets!,
    savingsGoals: data.savingsGoals!,
    debts: data.debts!,
    exchangeRates: data.exchangeRates!,
    settings: {
      ...DEFAULT_SETTINGS,
      ...data.settings,
    },
  };
}

async function isWebPlatform(): Promise<boolean> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return true;
  }
  try {
    const rn = await import('react-native');
    return rn.Platform?.OS === 'web';
  } catch {
    return false;
  }
}

function triggerWebDownload(content: string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function shareTextFileNative(
  content: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const fs = await import('expo-file-system');
  const sharing = await import('expo-sharing');
  const file = new fs.File(fs.Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
  }
}

/** Shares or downloads a CSV file on Web (`Blob`) and Native (`expo-file-system` + `expo-sharing`). */
export async function shareCsvFile(csv: string, filename: string): Promise<void> {
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  if (await isWebPlatform()) {
    triggerWebDownload(csv, safeName, 'text/csv;charset=utf-8;');
    return;
  }
  await shareTextFileNative(csv, safeName, 'text/csv');
}

/** Prints or shares a PDF financial report on Web (hidden iframe print) and Native (`expo-print` + `expo-sharing`). */
export async function sharePdfReport(
  snapshot: ReportSnapshot,
  filename = 'butce-raporu.pdf',
): Promise<void> {
  const html = generateReportHtml(snapshot);
  if (await isWebPlatform()) {
    if (typeof document !== 'undefined' && document.body) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');

      const cleanup = () => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      };

      iframe.onload = () => {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          cleanup();
          if (typeof window !== 'undefined') {
            window.print();
          }
          return;
        }
        if (typeof frameWindow.addEventListener === 'function') {
          frameWindow.addEventListener('afterprint', cleanup, { once: true });
        }
        frameWindow.focus();
        frameWindow.print();
        setTimeout(cleanup, 1_500);
      };

      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    } else if (typeof window !== 'undefined') {
      window.print();
    }
    return;
  }

  const print = await import('expo-print');
  const sharing = await import('expo-sharing');
  const { uri } = await print.printToFileAsync({ html });
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
  }
}

/** Shares or downloads a JSON backup file on Web (`Blob`) and Native (`expo-file-system` + `expo-sharing`). */
export async function shareJsonBackup(json: string, filename: string): Promise<void> {
  const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;
  if (await isWebPlatform()) {
    triggerWebDownload(json, safeName, 'application/json;charset=utf-8;');
    return;
  }
  await shareTextFileNative(json, safeName, 'application/json');
}
