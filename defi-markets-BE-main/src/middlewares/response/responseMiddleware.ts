import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

@Injectable()
export class ResponseMiddleware implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const path = (req && req.url) || "";

    if (path === "/api/docs" || path.startsWith("/api/docs/")) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: any) => {
        // If response already has status and data (already formatted), return as is
        if (
          body &&
          typeof body === "object" &&
          Object.prototype.hasOwnProperty.call(body, "status") &&
          Object.prototype.hasOwnProperty.call(body, "data")
        ) {
          return body;
        }

        // If response has pagination structure, return as is (don't wrap again)
        if (
          body &&
          typeof body === "object" &&
          Object.prototype.hasOwnProperty.call(body, "pagination")
        ) {
          return body;
        }

        const statusCode = (res && res.statusCode) || 200;
        const isErrorStatus = statusCode >= 400;
        const status = isErrorStatus ? "error" : "success";
        const message = res && res.statusMessage ? res.statusMessage : isErrorStatus ? "Error" : "OK";
        const data = body === undefined || body === null ? [] : body;
        return { status, message, data };
      })
    );
  }
}


