import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get ENV(): string {
    return this.configService.get<string>('app.ENV');
  }
  get PORT(): string {
    return this.configService.get<string>('app.PORT');
  }
  get VERSION(): string {
    return this.configService.get<string>('app.VERSION');
  }
  get SECRET_CODE(): string {
    return this.configService.get<string>('app.SECRET_CODE');
  }
  get SECRET_CODE_REFRESH(): string {
    return this.configService.get<string>('app.SECRET_CODE_REFRESH');
  }
  get TOPUP_CODE(): string {
    return this.configService.get<string>('app.TOPUP_CODE');
  }
  get URL_PUSH(): string {
    return this.configService.get<string>('app.URL_PUSH');
  }
  get NAME_PROGRAM(): string {
    return this.configService.get<string>('app.NAME_PROGRAM');
  }
  get PROGRAM_ID(): string {
    return this.configService.get<string>('app.PROGRAM_ID');
  }
  get KEYWORD(): string {
    return this.configService.get<string>('app.KEYWORD');
  }
  get JWT_SECRET(): string {
    return this.configService.get<string>('app.JWT_SECRET');
  }
  get JWT_EXPIRATION_TIME(): string {
    return this.configService.get<string>('app.JWT_EXPIRATION_TIME');
  }
  get COOKIES_EXPIRATION_DAY(): string {
    return this.configService.get<string>('app.COOKIES_EXPIRATION_DAY');
  }
  get API_PUSH_WA(): string {
    return this.configService.get<string>('app.API_PUSH_WA');
  }
  get DOMAIN_APP(): string {
    return this.configService.get<string>('app.DOMAIN_APP');
  }
  get CRYPTO_SECRET(): string {
    return this.configService.get<string>('app.CRYPTO_SECRET');
  }
  get TOKEN_FIREBASE(): string {
    return this.configService.get<string>('app.TOKEN_FIREBASE');
  }
  get MAIL_HOST(): string {
    return this.configService.get<string>('app.MAIL_HOST');
  }
  get MAIL_PORT(): string {
    return this.configService.get<string>('app.MAIL_PORT');
  }
  get MAIL_USER(): string {
    return this.configService.get<string>('app.MAIL_USER');
  }
  get MAIL_PASS(): string {
    return this.configService.get<string>('app.MAIL_PASS');
  }
  get HP_WA(): string {
    return this.configService.get<string>('app.HP_WA');
  }
  get BASE_URL(): string {
    return this.configService.get<string>('app.BASE_URL');
  }
}
