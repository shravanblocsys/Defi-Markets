import { 
  Controller, 
  Get, 
  Delete, 
  Param, 
  Query, 
  Post,
  Req,
  BadRequestException,
  Logger,
  UseGuards
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiConsumes, 
  ApiParam, 
  ApiQuery,
  ApiBearerAuth 
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { S3BucketService, UploadResult } from './s3-bucket.service';
import { AdminGuard } from '../../middlewares';

// Extend FastifyRequest to include multipart methods
interface MultipartRequest extends FastifyRequest {
  file(): Promise<any>;
  files(): AsyncIterableIterator<any>;
}

@ApiTags('S3 Bucket')
@ApiBearerAuth()
@Controller('api/v1/s3-bucket')
export class S3BucketController {
  private readonly logger = new Logger(S3BucketController.name);

  constructor(private readonly s3BucketService: S3BucketService) {}

  @Post('upload')
  async uploadFile(
    @Req() request: MultipartRequest,
    @Query('folder') folder?: string
  ): Promise<string> {
    try {
      const data = await request.file();
      
      if (!data) {
        throw new BadRequestException('No file provided');
      }

      // Convert Fastify multipart file to the format expected by our service
      const buffer = await data.toBuffer();
      const file = {
        fieldname: data.fieldname,
        originalname: data.filename,
        encoding: data.encoding,
        mimetype: data.mimetype,
        buffer: buffer,
        size: buffer.length,
      };

      const result = await this.s3BucketService.uploadFile(file, folder);
      
      return result;
    } catch (error) {
      this.logger.error(`Error uploading file: ${error.message}`);
      throw error;
    }
  }

  @Post('upload-multiple') 
  @UseGuards(AdminGuard)
  async uploadMultipleFiles(
    @Req() request: MultipartRequest,
    @Query('folder') folder?: string
  ): Promise<string[]> {
    try {
      const parts = request.files();
      const files: any[] = [];

      for await (const part of parts) {
        if (part.file) {
          const buffer = await part.toBuffer();
          const file = {
            fieldname: part.fieldname,
            originalname: part.filename,
            encoding: part.encoding,
            mimetype: part.mimetype,
            buffer: buffer,
            size: buffer.length,
          };
          files.push(file);
        }
      }

      if (files.length === 0) {
        throw new BadRequestException('No files provided');
      }

      const results = await this.s3BucketService.uploadMultipleFiles(files, folder);
      
      return results;
    } catch (error) {
      this.logger.error(`Error uploading multiple files: ${error.message}`);
      throw error;
    }
  }

  @Get('files')
  @UseGuards(AdminGuard)
  async listFiles(
    @Query('folder') folder?: string
  ): Promise<any[]> {
    try {
      const files = await this.s3BucketService.listFiles(folder);
      
        return files;
    } catch (error) {
      this.logger.error(`Error listing files: ${error.message}`);
      throw error;
    }
  }

  @Get('file/:key')
  @UseGuards(AdminGuard)
  async getFileUrl(
    @Param('key') key: string
  ): Promise<string> {
    try {
      const url = this.s3BucketService.getFileUrl(key);
      
      return url;
    } catch (error) {
      this.logger.error(`Error getting file URL: ${error.message}`);
      throw error;
    }
  }

  @Delete('file/:key')
  @UseGuards(AdminGuard)
  async deleteFile(
    @Param('key') key: string
  ): Promise<{ message: string }> {
    try {
      const result = await this.s3BucketService.deleteFile(key);
      
      return result;
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      throw error;
    }
  }

  @Get('info')
  @UseGuards(AdminGuard)
  async getBucketInfo(): Promise<{ 
    bucketName: string; 
    endpoint: string; 
    configured: boolean 
  }> {
    try {
      const info = this.s3BucketService.getBucketInfo();
      
      return info;
    } catch (error) {
      this.logger.error(`Error getting bucket info: ${error.message}`);
      throw error;
    }
  }
}