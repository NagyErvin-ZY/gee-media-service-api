import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsAssetIdArray } from '../validators/asset-id.validator';

export class BulkRetrievalDto {
  @ApiProperty({
    description: 'Array of asset IDs to retrieve in format: {type}-{mongoId}',
    example: ['image-60d21b4667d0d01ce85a7e41', 'video-60d21b4667d0d01ce85a7e42'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @ArrayMaxSize(25, { message: 'Cannot retrieve more than 25 assets at once' })
  @IsString({ each: true })
  @IsAssetIdArray({ message: 'Each asset ID must be in format "image-{objectId}" or "video-{objectId}" with a valid MongoDB ObjectId' })
  ids: string[];
}