import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  databaseUrl: process.env.BENCHMARK_DATABASE_URL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  reportsDir: path.resolve(__dirname, '../reports'),
};

export function validateConfig(requireOpenAi = false, requireDb = true): void {
  if (requireDb && !config.databaseUrl) {
    throw new Error('BENCHMARK_DATABASE_URL is required in .env');
  }
  if (requireOpenAi && !config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required in .env for generation');
  }
}
