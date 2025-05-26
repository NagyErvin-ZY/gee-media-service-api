import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Logger,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { VideoUploadService } from '../services/video-upload.service';
import { ClaimBasedVideoUploadDto } from '../dto/claim-based-video-upload.dto';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { WithDecodedUserJWT, UserID } from '@gpe/backend-common/dist/auth';

@ApiTags('videos')
@Controller('videos')
export class VideoUploadController {
  private readonly logger = new Logger(VideoUploadController.name);

  constructor(private readonly videoUploadService: VideoUploadService) {
    this.logger.log('VideoUploadController initialized');
  }

  @Get('upload-url')
  @ApiOperation({
    summary: 'Create a direct upload URL for a video using a claim',
    description: 'Creates a direct upload URL from Mux for client-side video uploads. No file upload required, the client will upload directly to Mux.'
  })
  @ApiQuery({
    name: 'claimId',
    required: true,
    description: 'Claim ID for this upload. Create a claim first via the /api/v1/claim endpoint.'
  })
  @ApiQuery({
    name: 'originalFilename',
    required: false,
    description: 'Optional original filename for the video'
  })
  @ApiResponse({
    status: 200,
    description: 'Direct upload URL created successfully',
    schema: {
      type: 'object',
      properties: {
        uploadId: { type: 'string', description: 'Unique identifier for this upload' },
        url: { type: 'string', description: 'Direct upload URL from Mux' },
        muxDirectUploadId: { type: 'string', description: 'Mux direct upload identifier' },
        id: { type: 'string', description: 'The ID of the local asset record in format video-<assetId>', example: 'video-123e4567-e89b-12d3-a456-426614174000' },
        profileName: { type: 'string', description: 'The video profile used for this upload' },
        maxSizeBytes: { type: 'number', description: 'Maximum file size in bytes' },
        maxDurationSeconds: { type: 'number', description: 'Maximum video duration in seconds' },
        allowedFormats: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed file formats (e.g., mp4, mov)'
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request or invalid claim' })
  @ApiResponse({ status: 403, description: 'Claim cannot be used or user not authorized' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async createDirectUpload(
    @UserID() userId: string,
    @Query('claimId') claimId: string,
    @Query('originalFilename') originalFilename?: string
  ) {
    this.logger.log(`Received direct upload URL request: claimId=${claimId}, userId=${userId}`);

    // Generate a UUID for the filename if none was provided - better for security by obscurity
    const { v4: uuidv4 } = require('uuid');
    const filename = originalFilename || `video-${uuidv4()}.mp4`;

    return this.videoUploadService.createDirectUploadWithClaim(
      userId,
      claimId,
      filename,
    );
  }
}