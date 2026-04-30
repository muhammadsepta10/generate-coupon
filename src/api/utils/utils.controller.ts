import { Controller, Get, UseGuards } from '@nestjs/common';
import { UtilsService } from './utils.service';
import { ApiKeyGuard } from '@common/guards/api-key.guard';

@Controller('utils')
@UseGuards(ApiKeyGuard)
export class UtilsController {
  constructor(private utilsService: UtilsService) {}

  @Get('/brute')
  bruteApi() {
    return this.utilsService.bruteApi();
  }
}
