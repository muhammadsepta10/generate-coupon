import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HelperModule } from './common/helper/helper.module';
import { CouponDbConfigModule } from './common/config/database-config/coupon-db-config/coupon-db-config.module';
import { MainDbModule } from './datasource/database/mysql/main-db/main-db.module';
import { CouponDbModule } from './datasource/database/mongo/coupon/coupon-db.module';
import { AppConfigModule } from '@common/config/app-config/app-config.module';
import { CouponWebModule } from './api/coupon/coupon-web.module';
import { BullModule } from '@nestjs/bull';
import { UtilsModule } from './api/utils/utils.module';
import { AuthModule } from './api/auth/auth.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { path as appRoot } from 'app-root-path';
import { resolve } from 'path';

/**
 * Web server module: HTTP controllers, WebSocket gateway, static files, Swagger.
 * No Bull processors — CPU-heavy work runs in the separate worker process.
 */
@Module({
  imports: [
    AppConfigModule,
    HelperModule,
    CouponDbConfigModule,
    MainDbModule,
    CouponDbModule,
    CouponWebModule,
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    UtilsModule,
    AuthModule,
    ServeStaticModule.forRoot({
      rootPath: resolve(`${appRoot}/public`),
      serveStaticOptions: {
        index: false,
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class WebModule {}
