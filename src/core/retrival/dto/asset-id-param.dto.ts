import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsAssetId } from '../validators/asset-id.validator';

export class AssetIdParamDto {
  @ApiProperty({
    description: 'Asset ID in format: {type}-{mongoId}',
    example: 'image-60d21b4667d0d01ce85a7e41',
    type: String,
  })
  @IsString()
  @IsAssetId({ message: 'Asset ID must be in format "image-{objectId}" or "video-{objectId}" with a valid MongoDB ObjectId' })
  assetId: string;
}