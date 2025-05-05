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

  @Post('upload')
  @ApiOperation({ 
    summary: 'Create a direct upload URL for a video using a claim',
    description: 'Creates a direct upload URL from Mux for client-side video uploads. No file upload required, the client will upload directly to Mux.'
  })
  @ApiQuery({ 
    name: 'claimId', 
    required: true, 
    description: 'Claim ID for this upload. Create a claim first via the /api/v1/claim endpoint.' 
  })
  @ApiResponse({
    status: 201,
    description: 'Direct upload URL created successfully',
    schema: {
      type: 'object',
      properties: {
        uploadId: { type: 'string', description: 'Unique identifier for this upload' },
        url: { type: 'string', description: 'Direct upload URL from Mux' },
        muxDirectUploadId: { type: 'string', description: 'Mux direct upload identifier' },
        assetId: { type: 'string', description: 'The ID of the local asset record' },
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
    @Body() uploadDto?: Omit<ClaimBasedVideoUploadDto, 'claimId'>,
  ) {
    this.logger.log(`Received direct upload request: claimId=${claimId}, userId=${userId}`);
    
    // Generate a UUID for the filename if none was provided - better for security by obscurity
    const { v4: uuidv4 } = require('uuid');
    const filename = uploadDto?.originalFilename || `video-${uuidv4()}.mp4`;
    
    // Extract optional params if provided
    const params = uploadDto?.params || {};
    
    return this.videoUploadService.createDirectUploadWithClaim(
      userId,
      claimId,
      filename,
      params
    );
  }

  @Get('upload/:id/status')
  @ApiOperation({ 
    summary: 'Check the status of a video upload',
    description: 'Retrieves the current status of a video that was uploaded through Mux. Status can be "preparing", "ready", "errored", or "deleted".'
  })
  @ApiParam({
    name: 'id',
    description: 'The upload ID, Mux direct upload ID, or Mux asset ID to check',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string', description: 'Asset ID in the database' },
        userId: { type: 'string', description: 'ID of the user who uploaded the video' },
        profileName: { type: 'string', description: 'Video profile used for this upload' },
        status: { 
          type: 'string', 
          enum: ['preparing', 'ready', 'errored', 'deleted'],
          description: 'Current status of the video' 
        },
        muxUploadStatus: { 
          type: 'string', 
          enum: ['waiting', 'processing', 'complete', 'failed', 'cancelled'],
          description: 'Status of the upload process' 
        },
        thumbnailUrl: { type: 'string', description: 'URL of the video thumbnail image' },
        duration: { type: 'number', description: 'Duration of the video in seconds' },
        muxInfo: { 
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Mux asset ID' },
            playbackId: { type: 'string', description: 'Mux playback ID used to construct playback URLs' }
          },
          description: 'Mux-specific information' 
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async checkUploadStatus(@Param('id') uploadId: string) {
    this.logger.log(`Checking status of upload ${uploadId}`);
    return this.videoUploadService.checkUploadStatus(uploadId);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a specific video asset',
    description: 'Retrieves detailed information about a specific video asset by its ID'
  })
  @ApiParam({
    name: 'id',
    description: 'The database ID of the video asset to retrieve',
  })
  @ApiResponse({
    status: 200,
    description: 'Video asset retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string', description: 'Asset ID in the database' },
        userId: { type: 'string', description: 'ID of the user who uploaded the video' },
        profileName: { type: 'string', description: 'Video profile used for this upload' },
        originalFilename: { type: 'string', description: 'Original filename of the uploaded video' },
        status: { type: 'string', description: 'Current status of the video' },
        duration: { type: 'number', description: 'Duration of the video in seconds' },
        resolution: { type: 'string', description: 'Resolution of the video (e.g., 1080p)' },
        aspectRatio: { type: 'string', description: 'Aspect ratio of the video' },
        thumbnailUrl: { type: 'string', description: 'URL of the video thumbnail image' },
        muxInfo: { 
          type: 'object',
          description: 'Information about the Mux asset'
        },
        createdAt: { type: 'string', format: 'date-time', description: 'When the asset was created' },
        updatedAt: { type: 'string', format: 'date-time', description: 'When the asset was last updated' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Video asset not found' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async getVideoAsset(@Param('id') assetId: string) {
    this.logger.log(`Getting video asset ${assetId}`);
    return this.videoUploadService.getVideoAsset(assetId);
  }

  @Post('webhook')
  @ApiOperation({ 
    summary: 'Handle webhook from Mux video service', 
    description: 'Processes webhook events from Mux to update video status. This endpoint should be configured in your Mux dashboard.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { 
          type: 'string',
          description: 'Event type (e.g., video.asset.ready, video.upload.asset_created)',
          example: 'video.asset.ready'
        },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Mux asset or upload ID' },
            playback_ids: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Playback ID' }
                }
              },
              description: 'Array of playback IDs'
            },
            status: { type: 'string', description: 'Asset status' }
          },
          description: 'Event data'
        }
      },
      additionalProperties: true,
    },
  })
  @ApiHeader({
    name: 'Mux-Signature',
    description: 'Signature for authenticating webhook (using your webhook secret)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'received' }
      }
    }
  })
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('mux-signature') signature?: string
  ) {
    this.logger.log(`Received webhook: type=${body.type || 'unknown'}`);
    return this.videoUploadService.handleWebhook(body, signature);
  }
}