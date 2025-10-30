import { Module } from '@nestjs/common';
import { S3BucketService } from './s3-bucket.service';
import { S3BucketController } from './s3-bucket.controller';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { ProfileModule } from '../profile/profile.module';
@Module({
  imports: [ConfigModule, AuthModule, RolesModule, ProfileModule],
  providers: [S3BucketService],
  controllers: [S3BucketController],
  exports: [S3BucketService], // Export service for use in other modules
})
export class S3BucketModule {}
