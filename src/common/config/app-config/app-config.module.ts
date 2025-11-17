import { Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './index';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : `.env.${process.env.NODE_ENV}`,
      load: [configuration],
      validationSchema: Joi.object({
        ENV: Joi.string(),
        PORT: Joi.string(),
        VERSION: Joi.string(),
        SECRET_CODE: Joi.string(),
        SECRET_CODE_REFRESH: Joi.string(),
        TOPUP_CODE: Joi.string(),
        URL_PUSH: Joi.string(),
        NAME_PROGRAM: Joi.string(),
        PROGRAM_ID: Joi.string(),
        KEYWORD: Joi.string(),
        JWT_SECRET: Joi.string(),
        JWT_EXPIRATION_TIME: Joi.string(),
        COOKIES_EXPIRATION_DAY: Joi.string(),
        API_PUSH_WA: Joi.string(),
        DOMAIN_APP: Joi.string(),
        CRYPTO_SECRET: Joi.string(),
        TOKEN_FIREBASE: Joi.string(),
        MAIL_HOST: Joi.string(),
        MAIL_PORT: Joi.string(),
        MAIL_USER: Joi.string(),
        MAIL_PASS: Joi.string(),
        HP_WA: Joi.string(),
        BASE_URL: Joi.string(),
      }),
    }),
  ],
  providers: [ConfigService, AppConfigService],
  exports: [ConfigService, AppConfigService],
})
export class AppConfigModule {}
