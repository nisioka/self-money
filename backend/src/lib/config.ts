import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  database: {
    url: string;
  };
  server: {
    port: number;
    host: string;
    corsOrigin: string;
  };
  security: {
    masterKey: string;
  };
  push: {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    vapidSubject: string;
  };
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    database: {
      url: getEnvOrDefault('DATABASE_URL', 'file:./dev.db'),
    },
    server: {
      port: Number(getEnvOrDefault('PORT', '3000')),
      host: getEnvOrDefault('HOST', '0.0.0.0'),
      corsOrigin: getEnvOrDefault('CORS_ORIGIN', 'http://localhost:5173'),
    },
    security: {
      masterKey: getEnvOrThrow('MASTER_KEY'),
    },
    push: {
      vapidPublicKey: getEnvOrThrow('VAPID_PUBLIC_KEY'),
      vapidPrivateKey: getEnvOrThrow('VAPID_PRIVATE_KEY'),
      vapidSubject: getEnvOrThrow('VAPID_SUBJECT'),
    },
  };
}

// Lazy-loaded singleton config
let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
