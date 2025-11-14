import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import headers from "fastify-helmet";
import fastifyRateLimiter from "fastify-rate-limit";
import multipart from "fastify-multipart";
import { AppModule } from "./modules/app/app.module";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { WINSTON_MODULE_PROVIDER } from "./modules/winston/winston.constants";
import { ConfigService } from "./modules/config/config.service";
import fastifyCookie from "fastify-cookie";
import { configurePassport } from "./modules/auth/passport.config";
import { sessionStore } from "./modules/auth/simple-session-store";
import "./instructions";

/**
 * The url endpoint for open api ui
 * @type {string}
 */
export const SWAGGER_API_ROOT = "api/docs";
/**
 * The name of the api
 * @type {string}
 */
export const SWAGGER_API_NAME = "API";
/**
 * A short description of the api
 * @type {string}
 */
export const SWAGGER_API_DESCRIPTION = "API Description";
/**
 * Current version of the api
 * @type {string}
 */
export const SWAGGER_API_CURRENT_VERSION = "1.0";

(async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  // Use Winston logger for the application
  const winstonLogger = app.get(WINSTON_MODULE_PROVIDER);

  // Create a Winston-compatible logger adapter
  const winstonAdapter = {
    log: (message: string, context?: string) =>
      winstonLogger.info(message, { context }),
    error: (message: string, trace?: string, context?: string) =>
      winstonLogger.error(message, { trace, context }),
    warn: (message: string, context?: string) =>
      winstonLogger.warn(message, { context }),
    debug: (message: string, context?: string) =>
      winstonLogger.debug(message, { context }),
    verbose: (message: string, context?: string) =>
      winstonLogger.verbose(message, { context }),
  };

  app.useLogger(winstonAdapter);

  // Get the logger instance for this file
  const logger = new Logger("Bootstrap");

  console.log("Starting DeFi Markets API...");
  console.log("Winston logging configured with file output");

  const options = new DocumentBuilder()
    .setTitle(SWAGGER_API_NAME)
    .setDescription(SWAGGER_API_DESCRIPTION)
    .setVersion(SWAGGER_API_CURRENT_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup(SWAGGER_API_ROOT, app, document);

  console.log(`Swagger documentation available at /${SWAGGER_API_ROOT}`);

  // Configure CORS with specific allowed origins for security using NestJS DI
  const configService = app.get(ConfigService);
  const allowedOrigins = configService.getCorsOrigins();
  const isLocal = configService.isEnv("local");

  // Add localhost origins for development
  const corsOrigins = isLocal
    ? [
        ...allowedOrigins,
        // Allow any localhost port for development
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/0\.0\.0\.0:\d+$/,
      ]
    : allowedOrigins;

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Origin",
      "Referer",
    ],
    credentials: true,
  });

  logger.log(`CORS configured with allowed origins: ${corsOrigins.join(", ")}`);

  app.register(headers);
  app.register(fastifyRateLimiter, {
    max: 100,
    timeWindow: 60000,
  });

  // Register cookie plugin for session management
  await app.register(fastifyCookie);

  // Get Fastify instance
  const fastifyInstance = app.getHttpAdapter().getInstance();

  // Create a simple session shim for Passport OAuth (without express-session)
  // This provides the minimal session interface that Passport expects for PKCE/state storage
  fastifyInstance.addHook("preHandler", async (request: any, reply) => {
    if (!request.session) {
      // Parse cookies from request header
      const cookieHeader = request.headers.cookie || "";
      const cookies: any = {};
      cookieHeader.split(";").forEach((cookie: string) => {
        const [name, value] = cookie.trim().split("=");
        if (name) cookies[name] = value;
      });

      // Get or create session ID
      let sessionId = cookies["oauth_sid"];

      // Get environment configuration for secure cookies
      const configService = app.get(ConfigService);
      const isProduction = configService.get("NODE_ENV") === "production";

      if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        // Set cookie manually with conditional Secure flag
        const cookieValue = `oauth_sid=${sessionId}; HttpOnly; ${
          isProduction ? "Secure;" : ""
        } Path=/; Max-Age=3600; SameSite=Lax`;
        reply.header("Set-Cookie", cookieValue);
      }

      // Create session object with methods Passport expects
      request.session = {
        _sessionId: sessionId,
        _store: sessionStore,

        // Get session data
        get(key: string) {
          const sessionData = this._store.get(this._sessionId) || {};
          return sessionData[key];
        },

        // Set session data
        set(key: string, value: any) {
          const sessionData = this._store.get(this._sessionId) || {};
          sessionData[key] = value;
          this._store.set(this._sessionId, sessionData);
        },

        // Save session (Passport calls this)
        save(callback?: (err?: any) => void) {
          if (callback) callback();
        },

        // Regenerate session ID
        regenerate(callback?: (err?: any) => void) {
          const newSessionId = `sess_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          const oldData = this._store.get(this._sessionId);
          this._store.delete(this._sessionId);
          this._sessionId = newSessionId;
          if (oldData) {
            this._store.set(newSessionId, oldData);
          }
          if (callback) callback();
        },

        // Destroy session
        destroy(callback?: (err?: any) => void) {
          this._store.delete(this._sessionId);
          if (callback) callback();
        },

        // Reload session
        reload(callback?: (err?: any) => void) {
          if (callback) callback();
        },
      };

      // Make it a Proxy to support direct property access (e.g., req.session.oauth2 = {...})
      request.session = new Proxy(request.session, {
        get(target, prop: string) {
          if (prop in target) {
            return target[prop];
          }
          return target.get(prop);
        },
        set(target, prop: string, value) {
          if (prop in target && prop.startsWith("_")) {
            target[prop] = value;
            return true;
          }
          target.set(prop, value);
          return true;
        },
      });
    }
  });

  logger.log("✅ Simple session shim configured for Passport OAuth");

  // Add Express-style response methods directly to Fastify reply for Passport compatibility
  fastifyInstance.addHook("preHandler", async (request, reply) => {
    // express-session already handles the session, we just need response compatibility
    if (!reply.setHeader) {
      reply.setHeader = (name: string, value: string) => {
        reply.header(name, value);
        return reply; // chainable
      };
    }
    if (!reply.getHeader) {
      reply.getHeader = (name: string) => reply.getHeader(name);
    }
    if (!reply.removeHeader) {
      reply.removeHeader = (name: string) => {
        reply.removeHeader(name);
        return reply;
      };
    }
    if (!reply.end) {
      reply.end = (data?: any) => reply.send(data);
    }
    if (!reply.status) {
      reply.status = (code: number) => {
        reply.code(code);
        return reply;
      };
    }
  });

  logger.log(
    "Cookie middleware and session shim configured for Fastify (Passport compatible)"
  );

  // Configure Passport serialization/deserialization
  configurePassport();

  // Register multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
      files: 10, // Maximum 10 files
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // helps to prevent unwanted properties from being passed to the controller
    })
  );

  // Auth middleware is globally applied via AppModule; no additional adapter-level middleware needed here

  // Health check endpoint
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get("/api/health", async (_request, reply) => {
    reply.code(200).send({ status: "ok" });
  });

  const port = 3400;
  await app.listen(port, "0.0.0.0");

  console.log(`DeFi Markets API is running on port ${port}`);
  console.log(`Health check available at http://0.0.0.0":${port}/api/health`);
  console.log(
    `API documentation available at http://0.0.0.0:${port}/${SWAGGER_API_ROOT}`
  );
})();
