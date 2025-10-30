import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedersService } from './seeders.service';
import { SeedersController } from './seeders.controller';
import { Role } from '../roles/roles.model';
import { Profile } from '../profile/profile.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Role', schema: Role },
      { name: 'Profile', schema: Profile }
    ])
  ],
  providers: [SeedersService],
  controllers: [SeedersController],
  exports: [SeedersService]
})
export class SeedersModule {}
