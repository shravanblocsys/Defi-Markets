import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { ProfileModule } from '../profile/profile.module';
import { RolesModule } from '../roles/roles.module';
import { SiwxController } from './siwx.controller';
import { SiwxService } from './siwx.service';
import { SiwxStorageService } from './siwx-storage.service';
import { SiwxVerifierService } from './siwx-verifier.service';


@Module({
  imports: [
    ConfigModule,
    ProfileModule,
    RolesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get("WEBTOKEN_SECRET_KEY"),
          signOptions: {
            ...(configService.get("WEBTOKEN_EXPIRATION_TIME")
              ? {
                  expiresIn: Number(
                    configService.get("WEBTOKEN_EXPIRATION_TIME"),
                  ),
                }
              : {}),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [SiwxController],
  providers: [
    SiwxService,
    SiwxStorageService,
    SiwxVerifierService,
  ],
  exports: [
    SiwxService,
    SiwxStorageService,
    SiwxVerifierService,
  ],
})
export class SiwxModule {}
