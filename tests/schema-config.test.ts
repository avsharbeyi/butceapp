import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(__dirname, '..');

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

const EXPECTED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'installment_plans',
  'recurring_rules',
  'budgets',
  'savings_goals',
  'debts',
  'shared_reports',
  'user_settings',
  'exchange_rates',
] as const;

describe('Supabase schema, environment config, and Expo configuration', () => {
  it('defines all 11 required tables with NUMERIC(14, 2) money columns and sync indexes', () => {
    const schema = readWorkspaceFile('supabase/schema.sql');

    for (const table of EXPECTED_TABLES) {
      expect(schema).toMatch(
        new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}\\b`, 'i'),
      );
      expect(schema).toMatch(
        new RegExp(`ON\\s+public\\.${table}\\s*\\(\\s*user_id\\s*,\\s*updated_at\\s*\\)`, 'i'),
      );
    }

    expect(schema).toMatch(/NUMERIC\(14,\s*2\)/i);
    expect(schema).toMatch(/ON\s+public\.transactions\s*\(\s*user_id\s*,\s*date\s*\)/i);
    expect(schema).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*?ON\s+public\.budgets[\s\S]*?WHERE\s+deleted_at\s+IS\s+NULL/i,
    );
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.transactions[\s\S]*?account_id\s+uuid\s+REFERENCES\s+public\.accounts\(id\)/i,
    );
    expect(schema).toMatch(
      /CHECK\s*\(\s*account_id\s+IS\s+NOT\s+NULL\s+OR\s+to_account_id\s+IS\s+NOT\s+NULL\s*\)/i,
    );
  });

  it('enables RLS and defines SELECT/INSERT/UPDATE/DELETE owner policies on every table', () => {
    const schema = readWorkspaceFile('supabase/schema.sql');

    for (const table of EXPECTED_TABLES) {
      expect(schema).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
      );

      for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(schema).toMatch(
          new RegExp(
            `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+public\\.${table}\\s+FOR\\s+${op}[\\s\\S]*?auth\\.uid\\(\\)\\s*=\\s*user_id`,
            'i',
          ),
        );
      }
    }
  });

  it('defines SECURITY DEFINER get_shared_report RPC and private receipts storage policies', () => {
    const schema = readWorkspaceFile('supabase/schema.sql');

    expect(schema).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_shared_report\(\s*p_token\s+text\s*\)\s*RETURNS\s+jsonb[\s\S]*?SECURITY\s+DEFINER/i,
    );
    expect(schema).toMatch(/view_count\s*=\s*view_count\s*\+\s*1/i);
    expect(schema).toMatch(/is_revoked/i);
    expect(schema).toMatch(/expires_at/i);
    expect(schema).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_shared_report\(text\)\s+TO\s+anon,\s*authenticated/i,
    );

    expect(schema).toMatch(/INSERT\s+INTO\s+storage\.buckets[\s\S]*?'receipts'[\s\S]*?false/i);
    expect(schema).toMatch(/bucket_id\s*=\s*'receipts'/i);
    expect(schema).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i);
  });

  it('includes all required environment keys in .env.example and ignores .superpowers/ and .env', () => {
    const envExample = readWorkspaceFile('.env.example');
    expect(envExample).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(envExample).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(envExample).toContain('EXPO_PUBLIC_WEB_BASE_URL');

    const gitignore = readWorkspaceFile('.gitignore');
    expect(gitignore).toContain('.superpowers/');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.expo/');
    expect(gitignore).toContain('dist/');
    expect(gitignore).toContain('.env');
  });

  it('configures app.json, package.json, and tsconfig.json for Expo Router TypeScript', () => {
    const appConfig = JSON.parse(readWorkspaceFile('app.json')) as {
      expo: {
        name: string;
        scheme: string;
        web?: { bundler?: string };
        plugins?: unknown[];
      };
    };

    expect(appConfig.expo.name).toBe('Bütçe Pro');
    expect(appConfig.expo.scheme).toBe('butceapp');
    expect(appConfig.expo.web?.bundler).toBe('metro');
    expect(appConfig.expo.plugins).toContain('expo-router');

    const pkg = JSON.parse(readWorkspaceFile('package.json')) as {
      main: string;
      scripts: Record<string, string>;
    };
    expect(pkg.main).toBe('expo-router/entry');
    for (const scriptName of ['start', 'web', 'android', 'ios', 'test', 'typecheck']) {
      expect(pkg.scripts[scriptName]).toBeTruthy();
    }

    const tsconfig = JSON.parse(readWorkspaceFile('tsconfig.json')) as {
      extends: string;
      compilerOptions: {
        strict: boolean;
        paths?: Record<string, string[]>;
      };
    };
    expect(tsconfig.extends).toBe('expo/tsconfig.base');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.paths?.['@/*']).toBeTruthy();
  });
});
