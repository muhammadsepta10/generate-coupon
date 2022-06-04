import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import errorLog from '../logs/error.log';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

    catch(exception: HttpException, host: ArgumentsHost): void {
        // In certain situations `httpAdapter` might not be available in the
        // constructor method, thus we should resolve it here.
        const {httpAdapter} = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        // console.log(Object.keys(ctx.getResponse()), ctx.getResponse().next)
        console.log("error", exception)
        const httpStatus =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;
        if (httpStatus >= 500) {
            errorLog.error({message: `Error`, data: {error: `${exception}`}, request: {body: ctx.getRequest().body}})
        }
        const responseBody = exception instanceof HttpException ? exception.getResponse() : {
            statusCode: httpStatus,
            message: "Internal server error!!",
            data: {
                timestamp: new Date().toISOString(),
                path: httpAdapter.getRequestUrl(ctx.getRequest())
            }
        };

        httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
    }
}
