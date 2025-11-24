import { Module, forwardRef } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { MongooseModule } from "@nestjs/mongoose";
import { Profile } from "./profile.model";
import { ProfileController } from "./profile.controller";
import { RolesModule } from "../roles/roles.module";
import { RedisModule } from "../../utils/redis";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "Profile", schema: Profile }]),
    RolesModule,
    RedisModule,
    forwardRef(() => AuthModule),
  ],
  providers: [ProfileService],
  exports: [ProfileService],
  controllers: [ProfileController],
})
export class ProfileModule {}
