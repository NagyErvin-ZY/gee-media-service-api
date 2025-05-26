import { ApiProperty } from '@nestjs/swagger';
import { UploadResult } from '../interfaces/upload-result.interface';

export class UploadResponseDto implements UploadResult {
  @ApiProperty({
    description: "ID of the uploaded asset, prefixed with 'image-<assetId>'",
    example: 'image-663e1b2f8c1a4e001e7e8a1b',
  })
  id: string;

  @ApiProperty({
    description: 'URL of the uploaded image',
    example: 'https://gpe-media.s3.eu-central-1.amazonaws.com/images/123e4567-e89b-12d3-a456-426614174000.webp',
  })
  url: string;

  @ApiProperty({
    description: 'Size of the uploaded file in bytes',
    example: 24680,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Width of the image in pixels',
    example: 800,
  })
  width: number;

  @ApiProperty({
    description: 'Height of the image in pixels',
    example: 600,
  })
  height: number;

  @ApiProperty({
    description: 'Format of the uploaded image',
    example: 'webp',
  })
  format: string;
}