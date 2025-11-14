import { Controller, Delete, Get, Param, Req, UseGuards } from "@nestjs/common";
import { AppService } from "./app.service";
import { ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import * as Sentry from "@sentry/nestjs";


/**
 * App Controller
 */
@Controller()
@ApiBearerAuth()
export class AppController {
  /**
   * Constructor
   * @param appService
   * @param profileService
   */
  constructor(private readonly appService: AppService) {}
  @Get("/debug-sentry")
  getError() {
    console.log("getError in apps");
    // Send a log before throwing the error
    Sentry.logger.info("User triggered test error", {
      action: "test_error_endpoint",
    });
    throw new Error("My first Sentry error!");
  }

  /**
   * Returns the an environment variable from config file
   * @returns {string} the application environment url
   */
  @Get()
  @UseGuards(AuthGuard("jwt"))
  @ApiResponse({ status: 200, description: "Request Received" })
  @ApiResponse({ status: 400, description: "Request Failed" })
  getString(): string {
    return this.appService.root();
  }

  /**
   * Fetches request metadata
   * @param {Req} req the request body
   * @returns {Partial<Request>} the request user populated from the passport module
   */
  @Get("request/user")
  @UseGuards(AuthGuard("jwt"))
  @ApiResponse({ status: 200, description: "Request Received" })
  @ApiResponse({ status: 400, description: "Request Failed" })
  getProfile(@Req() req): Partial<Request> {
    return req.user;
  }
}
