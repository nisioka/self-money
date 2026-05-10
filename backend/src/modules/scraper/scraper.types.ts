import type { Account } from '@prisma/client';

/**
 * 取引データの正規化された形式
 */
export interface ScrapedTransaction {
  date: Date;
  amount: number; // 正: 入金, 負: 出金
  description: string;
  externalId: string; // 重複チェック用の一意識別子
}

/**
 * スクレイピング結果
 */
export interface ScrapeResult {
  accountId: number;
  transactions: ScrapedTransaction[];
  balance: number;
}

/**
 * スクレイピングエラーの種類
 */
export type ScrapeErrorType =
  | 'AUTH_FAILED'
  | 'SITE_CHANGED'
  | 'NETWORK_ERROR'
  | 'TWO_FACTOR_REQUIRED'
  | 'OTP_TIMEOUT'
  | 'OTP_MAX_RETRIES'
  | 'NO_CREDENTIALS';

/**
 * OTP認証方式
 */
export type OtpAuthMethod = 'TOTP' | 'SMS' | 'EMAIL' | 'PUSH_APPROVAL';

/**
 * OTP画面検知結果
 */
export interface OtpDetectionResult {
  detected: boolean;
  authMethod: OtpAuthMethod | null;
  otpInputSelector: string | null;
  otpSubmitSelector: string | null;
}

/**
 * OTPセレクター定義（各スクレイパーでオーバーライド）
 */
export interface OtpSelectors {
  // OTP画面を検知するためのセレクター
  detectionSelectors: string[];
  // 認証方式判定用のセレクター（オプション）
  authMethodSelectors?: Partial<Record<OtpAuthMethod, string>>;
  // OTP入力フィールドのセレクター
  inputSelector: string;
  // OTP送信ボタンのセレクター
  submitSelector: string;
}

/**
 * スクレイピングエラー
 */
export interface ScrapeAccountError {
  accountId: number;
  errorType: ScrapeErrorType;
  message: string;
}

/**
 * 全口座スクレイピング結果
 */
export interface ScrapeAllResult {
  results: ScrapeResult[];
  errors: ScrapeAccountError[];
}

/**
 * スクレイパーインターフェース
 * 各金融機関ごとに実装する
 */
export interface Scraper {
  /**
   * サポートする口座名を返す
   */
  getSupportedAccountName(): string;

  /**
   * スクレイピングを実行する
   * @param credentials 復号済みの認証情報
   */
  scrape(credentials: DecryptedCredentials): Promise<ScrapeResult>;
}

/**
 * 復号済み認証情報
 */
export interface DecryptedCredentials {
  username: string;
  password: string;
  additionalFields?: Record<string, string>;
}

/**
 * スクレイパーファクトリ
 * 口座名からスクレイパーインスタンスを取得する
 */
export interface ScraperFactory {
  getScraper(accountName: string): Scraper | null;
  getSupportedAccountNames(): string[];
}
