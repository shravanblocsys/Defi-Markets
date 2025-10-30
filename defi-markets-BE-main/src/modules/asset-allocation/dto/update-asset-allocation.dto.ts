import { PartialType } from '@nestjs/swagger';
import { CreateAssetAllocationDto } from './create-asset-allocation.dto';

export class UpdateAssetAllocationDto extends PartialType(CreateAssetAllocationDto) {
  // All fields from CreateAssetAllocationDto are optional in update
  // The PartialType decorator makes all properties optional
}
