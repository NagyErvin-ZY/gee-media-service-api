import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadImageDto {
  @ApiProperty({
    description: 'Minimum width of the image in pixels',
    required: false,
    type: Number,
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  minWidth?: number;

  @ApiProperty({
    description: 'Minimum height of the image in pixels',
    required: false,
    type: Number,
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  minHeight?: number;

  @ApiProperty({
    description: 'Maximum width of the image in pixels (will resize if exceeded while preserving aspect ratio)',
    required: false,
    type: Number,
    example: 1920,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxWidth?: number;

  @ApiProperty({
    description: 'Maximum height of the image in pixels (will resize if exceeded while preserving aspect ratio)',
    required: false,
    type: Number,
    example: 1080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxHeight?: number;

  @ApiProperty({
    description: 'WebP compression quality (1-100)',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    example: 80,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  quality?: number;

  @ApiProperty({
    description: 'Profile name for upload (e.g., profile_picture)',
    required: false,
    type: String,
    example: 'profile_picture',
  })
  @IsOptional()
  profileName?: string;
}