import { Test, TestingModule } from '@nestjs/testing';
import { S3BucketController } from './s3-bucket.controller';

describe('S3BucketController', () => {
  let controller: S3BucketController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [S3BucketController],
    }).compile();

    controller = module.get<S3BucketController>(S3BucketController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
