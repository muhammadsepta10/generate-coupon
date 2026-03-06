import { Module } from '@nestjs/common';
import { HelperService } from './helper.service';
import { QrStylingService } from './qr-styling.service';
import { AppConfigModule } from '@common/config/app-config/app-config.module';

@Module({
  providers: [HelperService, QrStylingService],
  exports: [HelperService, QrStylingService],
  imports: [AppConfigModule],
})
export class HelperModule {}
