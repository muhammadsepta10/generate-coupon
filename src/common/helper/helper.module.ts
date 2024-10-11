import { Module } from "@nestjs/common";
import { HelperService } from "./helper.service";
import { AppConfigModule } from "@common/config/app-config/app-config.module";

@Module({
  providers: [HelperService],
  exports: [HelperService],
  imports: [AppConfigModule],
})
export class HelperModule {}
