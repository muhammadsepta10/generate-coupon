import { Controller, Get } from '@nestjs/common';
import { UtilsService } from './utils.service';

@Controller('utils')
export class UtilsController {
  constructor(private utilsService: UtilsService) {}

  @Get('/brute')
  bruteApi() {
    return this.utilsService.bruteApi();
  }
}
