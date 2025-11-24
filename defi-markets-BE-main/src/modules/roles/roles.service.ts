import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { IRole } from "./roles.model";
import { CreateRolePayload } from "./payload/create-role.payload";
import { UpdateRolePayload } from "./payload/update-role.payload";
import { ProfileService } from "../profile/profile.service";
import { Inject, forwardRef } from "@nestjs/common";

/**
 * Models a typical response for a crud operation
 */
export interface IGenericMessageBody {
  /**
   * Status message to return
   */
  message: string;
}

/**
 * Roles Service
 */
@Injectable()
export class RolesService {
  /**
   * Constructor
   * @param {Model<IRole>} roleModel
   */
  constructor(
    @InjectModel("Role") private readonly roleModel: Model<IRole>,
    @Inject(forwardRef(() => ProfileService))
    private readonly profileService: ProfileService
  ) {}

  /**
   * Fetches a role from database by UUID
   * @param {string} id
   * @returns {Promise<IRole>} queried role data
   */
  async get(id: string): Promise<IRole> {
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }

  /**
   * Fetches a role from database by name
   * @param {string} name
   * @returns {Promise<IRole>} queried role data
   */
  async getByName(name: string): Promise<IRole> {
    const role = await this.roleModel.findOne({ name: name.toUpperCase() }).exec();
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }

  /**
   * Fetches all roles from database
   * @returns {Promise<IRole[]>} queried roles data
   */
  async getAll(): Promise<IRole[]> {
    return this.roleModel.find({ isActive: true }).exec();
  }

  /**
   * Create a role with CreateRolePayload fields
   * @param {CreateRolePayload} payload role payload
   * @returns {Promise<IRole>} created role data
   */
  async create(payload: CreateRolePayload): Promise<IRole> {
    const existingRole = await this.roleModel.findOne({ 
      name: payload.name.toUpperCase() 
    }).exec();
    
    if (existingRole) {
      throw new ConflictException("Role with this name already exists");
    }

    const createdRole = new this.roleModel({
      ...payload,
      name: payload.name.toUpperCase(),
      isActive: payload.isActive !== undefined ? payload.isActive : true,
    });

    return createdRole.save();
  }

  /**
   * Edit role data
   * @param {string} id role id
   * @param {UpdateRolePayload} payload
   * @returns {Promise<IRole>} mutated role data
   */
  async update(id: string, payload: UpdateRolePayload): Promise<IRole> {
    const role = await this.get(id);
    
    // Check if name is being updated and if it conflicts with existing role
    if (payload.name && payload.name.toUpperCase() !== role.name) {
      const existingRole = await this.roleModel.findOne({ 
        name: payload.name.toUpperCase() 
      }).exec();
      
      if (existingRole) {
        throw new ConflictException("Role with this name already exists");
      }
    }

    const updateData = { ...payload };
    if (payload.name) {
      updateData.name = payload.name.toUpperCase();
    }

    const updatedRole = await this.roleModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).exec();

    if (!updatedRole) {
      throw new NotFoundException("Role not found");
    }

    return updatedRole;
  }

  /**
   * Delete role given an id
   * @param {string} id
   * @returns {Promise<IGenericMessageBody>} whether or not the crud operation was completed
   */
  async delete(id: string): Promise<IGenericMessageBody> {
    const role = await this.get(id);
    
    const result = await this.roleModel.deleteOne({ _id: id }).exec();
    
    if (result.deletedCount === 1) {
      return { message: `Deleted role '${role.name}' from records` };
    } else {
      throw new BadRequestException(`Failed to delete role with id ${id}`);
    }
  }

  /**
   * Soft delete role by setting isActive to false
   * @param {string} id
   * @returns {Promise<IRole>} updated role data
   */
  async softDelete(id: string): Promise<IRole> {
    const role = await this.get(id);
    
    const updatedRole = await this.roleModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).exec();

    if (!updatedRole) {
      throw new NotFoundException("Role not found");
    }

    return updatedRole;
  }
}
