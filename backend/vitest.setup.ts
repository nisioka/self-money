import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}
if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY =
    '0000000000000000000000000000000000000000000000000000000000000000';
}
if (!process.env.VAPID_PUBLIC_KEY) {
  process.env.VAPID_PUBLIC_KEY =
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
}
if (!process.env.VAPID_PRIVATE_KEY) {
  process.env.VAPID_PRIVATE_KEY = 'tBHItJI5svbpez7KI4CCXg-test-key-for-development-only-aaa';
}
if (!process.env.VAPID_SUBJECT) {
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
}
