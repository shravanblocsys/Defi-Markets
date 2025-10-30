import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as AWS from 'aws-sdk';
import * as path from 'path';
import * as crypto from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  originalName: string;
}

@Injectable()
export class S3BucketService {
  private readonly logger = new Logger(S3BucketService.name);
  private s3: AWS.S3;
  private bucketName: string;

  // Allowed file types
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'text/plain',
    'application/json',
    'application/zip',
    'application/x-zip-compressed'
  ];

  // Allowed file extensions
  private readonly allowedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.pdf', '.txt', '.json', '.zip'
  ];

  // Maximum file size (10MB)
  private readonly maxFileSize = 10 * 1024 * 1024;

  constructor(private readonly configService: ConfigService) {
    this.initializeS3();
  }

  private initializeS3(): void {
    const endpoint = this.configService.get('MINIO_ENDPOINT');
    const accessKey = this.configService.get('MINIO_ACCESS_KEY');
    const secretKey = this.configService.get('MINIO_SECRET_KEY');
    this.bucketName = this.configService.get('MINIO_BUCKET_NAME');

    if (!endpoint || !accessKey || !secretKey || !this.bucketName) {
      this.logger.warn('S3/MinIO configuration is incomplete. File upload will be disabled.');
      return;
    }

    // Configure AWS SDK for MinIO
    this.s3 = new AWS.S3({
      endpoint: endpoint,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      s3ForcePathStyle: true, // Required for MinIO
      signatureVersion: 'v4',
      region: 'us-east-1' // MinIO doesn't care about region, but AWS SDK requires it
    });

    this.logger.log('S3/MinIO client initialized successfully');
  }

  /**
   * Upload a file to S3/MinIO bucket
   * @param file - The file to upload
   * @param folder - Optional folder path in the bucket
   * @returns Upload result with file URL and metadata
   */
  async uploadFile(file: any, folder?: string): Promise<string> {
    if (!this.s3) {
      throw new BadRequestException('S3/MinIO is not configured');
    }

    // Validate file
    this.validateFile(file);

    // Generate unique filename
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = this.generateUniqueFileName(fileExtension);
    const key = folder ? `${folder}/${fileName}` : fileName;

    try {
      // Upload file to S3/MinIO
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Removed ACL: 'public-read' for better security - use signed URLs instead
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      };

      const result = await this.s3.upload(uploadParams).promise();

      this.logger.log(`File uploaded successfully: ${key}`);

      // Return only the URL
      return result.Location;
    } catch (error) {
      this.logger.error(`Error uploading file: ${error.message}`);
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload multiple files to S3/MinIO bucket
   * @param files - Array of files to upload
   * @param folder - Optional folder path in the bucket
   * @returns Array of upload results
   */
  async uploadMultipleFiles(files: any[], folder?: string): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const uploadPromises = files.map(file => this.uploadFile(file, folder));
    
    try {
      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} files`);
      return results;
    } catch (error) {
      this.logger.error(`Error uploading multiple files: ${error.message}`);
      throw new BadRequestException(`Failed to upload files: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3/MinIO bucket
   * @param key - The file key to delete
   * @returns Success message
   */
  async deleteFile(key: string): Promise<{ message: string }> {
    if (!this.s3) {
      throw new BadRequestException('S3/MinIO is not configured');
    }

    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();

      this.logger.log(`File deleted successfully: ${key}`);
      return { message: 'File deleted successfully' };
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get file URL from S3/MinIO bucket
   * @param key - The file key
   * @returns File URL
   */
  getFileUrl(key: string): string {
    if (!this.s3) {
      throw new BadRequestException('S3/MinIO is not configured');
    }

    return this.s3.getSignedUrl('getObject', {
      Bucket: this.bucketName,
      Key: key,
      Expires: 3600 // URL expires in 1 hour
    });
  }

  /**
   * List files in a folder
   * @param folder - Optional folder path
   * @returns List of files
   */
  async listFiles(folder?: string): Promise<any[]> {
    if (!this.s3) {
      throw new BadRequestException('S3/MinIO is not configured');
    }

    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: this.bucketName,
        Prefix: folder || '',
        MaxKeys: 1000
      };

      const result = await this.s3.listObjectsV2(params).promise();
      
      return result.Contents?.map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
        url: this.getFileUrl(file.Key)
      })) || [];
    } catch (error) {
      this.logger.error(`Error listing files: ${error.message}`);
      throw new BadRequestException(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Validate file before upload
   * @param file - The file to validate
   */
  private validateFile(file: any): void {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }

    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!this.allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException(`File extension ${fileExtension} is not allowed`);
    }
  }

  /**
   * Generate unique filename
   * @param extension - File extension
   * @returns Unique filename
   */
  private generateUniqueFileName(extension: string): string {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(16).toString('hex');
    return `${timestamp}-${randomString}${extension}`;
  }

  /**
   * Check if S3/MinIO is configured
   * @returns Boolean indicating if S3 is configured
   */
  isConfigured(): boolean {
    return !!this.s3;
  }

  /**
   * Get bucket information
   * @returns Bucket configuration info
   */
  getBucketInfo(): { bucketName: string; endpoint: string; configured: boolean } {
    return {
      bucketName: this.bucketName || 'Not configured',
      endpoint: this.configService.get('MINIO_ENDPOINT') || 'Not configured',
      configured: this.isConfigured()
    };
  }
}