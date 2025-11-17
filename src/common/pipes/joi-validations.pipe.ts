import * as Joi from 'joi';
import {
  Injectable,
  PipeTransform,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Injectable()
export abstract class JoiValidationPipe implements PipeTransform<unknown> {
  public transform(value: unknown): unknown {
    const result = this.buildSchema().validate(value);

    if (result.error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          data: {
            message: result.error.message.replace(/"/g, `'`),
          },
        },
        HttpStatus.BAD_REQUEST,
      );
      // throw new BadRequestException('Validation failed');
    }

    return result.value;
  }

  public abstract buildSchema(): Joi.Schema;
}
