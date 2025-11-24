import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PinataService } from "./pinata.service";
import { PinataController } from "./pinata.controller";
import { ConfigModule } from "../config/config.module";
import { AuthModule } from "../auth/auth.module";
import { RolesModule } from "../roles/roles.module";
import { ProfileModule } from "../profile/profile.module";

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 seconds timeout for file uploads
      maxRedirects: 3,
    }),
    ConfigModule,
    AuthModule,
    RolesModule,
    ProfileModule,
  ],
  providers: [PinataService],
  controllers: [PinataController],
  exports: [PinataService], // Export service for use in other modules
})
export class PinataModule {}
