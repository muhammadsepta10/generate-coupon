import { registerAs } from '@nestjs/config';
export default registerAs('couponDB', () => ({
  HOST: process.env.COUPON_DB_PROJECT_HOST,
  USER: process.env.COUPON_DB_PROJECT_USER,
  PASS: process.env.COUPON_DB_PROJECT_PASS,
  NAME: process.env.COUPON_DB_PROJECT_NAME,
  URL: process.env.COUPON_DB_URL,
}));
