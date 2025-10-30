import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule } from "../config/config.module";
import { SiwxModule } from "../siwx/siwx.module";
import { ConfigService } from "../config/config.service";
import { ProfileModule } from "../profile/profile.module";
import { RolesModule } from "../roles/roles.module";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { TwitterStrategy } from "./twitter.strategy";
import { AuthController } from "./auth.controller";
import { TwitterAuthController } from "./twitter-auth.controller";
import { AdminGuard } from "../../middlewares";

@Module({
  imports: [
    ProfileModule,
    SiwxModule,
    RolesModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get("WEBTOKEN_SECRET_KEY"),
          signOptions: {
            ...(configService.get("WEBTOKEN_EXPIRATION_TIME")
              ? {
                  expiresIn: Number(
                    configService.get("WEBTOKEN_EXPIRATION_TIME")
                  ),
                }
              : {}),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, TwitterAuthController],
  providers: [AuthService, JwtStrategy, TwitterStrategy, AdminGuard],
  exports: [PassportModule.register({ defaultStrategy: "jwt" }), JwtModule],
})
export class AuthModule {}
