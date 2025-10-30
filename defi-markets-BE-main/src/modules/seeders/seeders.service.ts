import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as gravatar from 'gravatar';
import { IRole } from '../roles/roles.model';
import { IProfile } from '../profile/profile.model';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class SeedersService {
  private readonly logger = new Logger(SeedersService.name);
  private readonly seedersData: any;

  constructor(
    @InjectModel('Role') private readonly roleModel: Model<IRole>,
    @InjectModel('Profile') private readonly profileModel: Model<IProfile>,
  ) {
    // Load seeders data from JSON file
    try {
      // Primary: load from compiled dist folder
      let dataPath = join(__dirname, 'seeders-data.json');
      let data: string;
      try {
        data = readFileSync(dataPath, 'utf8');
      } catch (e) {
        // Fallback: load from src during dev/runtime without copied asset
        dataPath = join(process.cwd(), 'src', 'modules', 'seeders', 'seeders-data.json');
        data = readFileSync(dataPath, 'utf8');
      }
      this.seedersData = JSON.parse(data);
    } catch (error) {
      this.logger.error('Failed to load seeders data:', error);
      throw new Error('Could not load seeders data file');
    }
  }

  /**
   * Seed all data (roles and profiles)
   */
  async seedAll(): Promise<{ message: string; data: any }> {
    try {
      this.logger.log('Starting seeding process...');
      
      // Seed roles first
      const roles = await this.seedRoles();
      
      // Seed profiles with role references
      const profiles = await this.seedProfiles(roles);
      
      this.logger.log('Seeding process completed successfully');
      
      return {
        message: 'Seeding completed successfully',
        data: {
          roles: roles.length,
          profiles: profiles.length
        }
      };
    } catch (error) {
      this.logger.error('Seeding process failed:', error);
      throw error;
    }
  }

  /**
   * Seed roles from JSON data
   */
  async seedRoles(): Promise<IRole[]> {
    this.logger.log('Seeding roles...');
    const createdRoles: IRole[] = [];

    for (const roleData of this.seedersData.roles) {
      try {
        // Check if role already exists
        const existingRole = await this.roleModel.findOne({ name: roleData.name });
        
        if (existingRole) {
          this.logger.log(`Role ${roleData.name} already exists, skipping...`);
          createdRoles.push(existingRole);
          continue;
        }

        // Create new role
        const newRole = new this.roleModel(roleData);
        const savedRole = await newRole.save();
        createdRoles.push(savedRole);
        
        this.logger.log(`Created role: ${savedRole.name}`);
      } catch (error) {
        this.logger.error(`Failed to create role ${roleData.name}:`, error);
        throw error;
      }
    }

    return createdRoles;
  }

  /**
   * Seed profiles from JSON data
   */
  async seedProfiles(roles: IRole[]): Promise<IProfile[]> {
    this.logger.log('Seeding profiles...');
    const createdProfiles: IProfile[] = [];

    // Create a map of role names to IDs for easy lookup
    const roleMap = new Map<string, string>();
    roles.forEach(role => {
      roleMap.set(role.name, role._id.toString());
    });

    for (const profileData of this.seedersData.profiles) {
      try {
        // Check if profile already exists
        const existingProfile = await this.profileModel.findOne({ 
          $or: [
            { email: profileData.email },
            { username: profileData.username }
          ]
        });
        
        if (existingProfile) {
          this.logger.log(`Profile ${profileData.username} already exists, skipping...`);
          createdProfiles.push(existingProfile);
          continue;
        }

        // Replace role placeholder with actual role ID
        let roleId = profileData.roleId;
        if (roleId === '{{ADMIN_ROLE_ID}}') {
          roleId = roleMap.get('ADMIN');
          if (!roleId) {
            throw new Error('ADMIN role not found. Please seed roles first.');
          }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(profileData.password, 10);

        // Generate avatar if not provided
        const avatar = profileData.avatar || gravatar.url(profileData.email, {
          s: '200',
          r: 'pg',
          d: 'identicon'
        });

        // Create new profile
        const newProfile = new this.profileModel({
          ...profileData,
          password: hashedPassword,
          avatar,
          roleId
        });

        const savedProfile = await newProfile.save();
        createdProfiles.push(savedProfile);
        
        this.logger.log(`Created profile: ${savedProfile.username}`);
      } catch (error) {
        this.logger.error(`Failed to create profile ${profileData.username}:`, error);
        throw error;
      }
    }

    return createdProfiles;
  }

  /**
   * Clear all seeded data (for testing/development)
   */
  async clearAll(): Promise<{ message: string }> {
    try {
      this.logger.log('Clearing all seeded data...');
      
      // Clear profiles first (due to foreign key constraint)
      await this.profileModel.deleteMany({});
      
      // Clear roles
      await this.roleModel.deleteMany({});
      
      this.logger.log('All seeded data cleared successfully');
      
      return { message: 'All seeded data cleared successfully' };
    } catch (error) {
      this.logger.error('Failed to clear seeded data:', error);
      throw error;
    }
  }

  /**
   * Get seeding status
   */
  async getStatus(): Promise<{ roles: number; profiles: number }> {
    const roleCount = await this.roleModel.countDocuments();
    const profileCount = await this.profileModel.countDocuments();
    
    return {
      roles: roleCount,
      profiles: profileCount
    };
  }
}
