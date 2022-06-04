import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class CouponDbConfigService {
    constructor(private configService: ConfigService) {
    }

    get URL(): string {
        return this.configService.get<string>("couponDB.URL")
    }

    get HOST(): string {
        return this.configService.get<string>("couponDB.HOST")
    }

    get USER(): string {
        return this.configService.get<string>("couponDB.USER")
    }

    get PASS(): string {
        return this.configService.get<string>("couponDB.PASS")
    }

    get NAME(): string {
        return this.configService.get<string>("couponDB.NAME")
    }
}
