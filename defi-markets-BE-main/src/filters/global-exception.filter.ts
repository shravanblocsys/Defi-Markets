import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { SentryExceptionCaptured } from "@sentry/nestjs";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error" };

    // Fastify uses .code() instead of .status() and .send() instead of .json()
    response.code(status).send({
      statusCode: status,
      path: request?.url,
      timestamp: new Date().toISOString(),
      error: body,
    });
  }
}
