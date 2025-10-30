import { parse } from "dotenv";
import * as joi from "@hapi/joi";
import * as fs from "fs";

/**
 * Key-value mapping
 */
export interface EnvConfig {
  [key: string]: string;
}

/**
 * Config Service
 */
export class ConfigService {
  /**
   * Object that will contain the injected environment variables
   */
  private readonly envConfig: EnvConfig;

  /**
   * Constructor
   * @param {string} filePath
   */
  constructor(filePath: string) {
    const config = parse(fs.readFileSync(filePath));
    this.envConfig = ConfigService.validateInput(config);
  }

  /**
   * Ensures all needed variables are set, and returns the validated JavaScript object
   * including the applied default values.
   * @param {EnvConfig} envConfig the configuration object with variables from the configuration file
   * @returns {EnvConfig} a validated environment configuration object
   */
  private static validateInput(envConfig: EnvConfig): EnvConfig {
    /**
     * A schema to validate envConfig against
     */
    const envVarsSchema: joi.ObjectSchema = joi
      .object({
        APP_ENV: joi.string().valid("local", "qa", "prod").default("local"),
        APP_URL: joi.string().uri({
          scheme: [/https?/],
        }),
        WEBTOKEN_SECRET_KEY: joi.string().required(),
        WEBTOKEN_EXPIRATION_TIME: joi.number().default(1800),
        DB_URL: joi.string().regex(/^mongodb/),
        SOLANA_NETWORK: joi
          .string()
          .valid("devnet", "testnet", "mainnet-beta")
          .default("devnet"),
        SOLANA_RPC_URL: joi.string().uri().optional(),
        WALLET_CONNECT_PROJECT_ID: joi.string().optional(),
        HELIUS_API_KEY: joi.string().optional(),
        HELIUS_WEBHOOK_SECRET: joi.string().required(),
        SOLANA_VAULT_FACTORY_ADDRESS: joi.string().required(),
        SOLANA_ADMIN_PRIVATE_KEY: joi.string().optional(),
        // External APIs
        JUPITER_API_BASE_URL: joi.string().uri().optional(),

        // S3/MinIO Configuration
        MINIO_ENDPOINT: joi.string().optional(),
        MINIO_ACCESS_KEY: joi.string().optional(),
        MINIO_SECRET_KEY: joi.string().optional(),
        MINIO_BUCKET_NAME: joi.string().optional(),

        // Rate Limiting Configuration
        RATE_LIMIT_REQ_COUNT: joi.number().integer().min(1).optional(),
        RATE_LIMIT_TIME_WINDOW: joi.number().integer().min(1000).optional(),

        // Cron/Cooldown Configuration (default 15 minutes in ms)
        COOLDOWN_PERIOD: joi.number().integer().min(0).default(900000),

        // Cron Expressions
        CRON_JOB_INTERVAL: joi
          .string()
          .pattern(/^[^\n\r]+$/)
          .default("0 */15 * * * *"),

        // CORS Configuration - Environment specific origins (comma-separated)
        LOCAL_ORIGINS: joi.string().optional(),
        QA_ORIGINS: joi.string().optional(),
        PROD_ORIGINS: joi.string().optional(),

        // Twitter OAuth Configuration
        TWITTER_CLIENT_ID: joi.string().optional(),
        TWITTER_CLIENT_SECRET: joi.string().optional(),
        BASE_URL: joi.string().uri().optional(),
        CLIENT_HOME_PAGE_URL: joi.string().uri().optional(),
        CLIENT_TYPE: joi.string().optional(),
        SESSION_SECRET: joi.string().optional(),
        REDIRECT_URI: joi.string().uri().optional(),

        // Vault Configuration
        MINI_DEPOSIT: joi.number().positive().optional(),
        MINI_REDEEM: joi.number().positive().optional(),
      })
      .unknown(true);

    /**
     * Represents the status of validation check on the configuration file
     */
    const { error, value: validatedEnvConfig } =
      envVarsSchema.validate(envConfig);
    if (error) {
      throw new Error(`Config validation error: ${error.message}`);
    }
    return validatedEnvConfig;
  }

  /**
   * Fetches the key from the configuration file
   * @param {string} key
   * @returns {string} the associated value for a given key
   */
  get(key: string): string {
    return this.envConfig[key];
  }

  /**
   * Checks whether the application environment set in the configuration file matches the environment parameter
   * @param {string} env
   * @returns {boolean} Whether or not the environment variable matches the application environment
   */
  isEnv(env: string): boolean {
    return this.envConfig.APP_ENV === env;
  }

  /**
   * Gets CORS origins from configuration based on environment
   * @returns {string[]} Array of allowed CORS origins
   */
  getCorsOrigins(): string[] {
    const appEnv = this.get("APP_ENV").toUpperCase();
    const originsString = this.get(`${appEnv}_ORIGINS`);

    if (originsString) {
      return originsString
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    }

    return [];
  }
}
