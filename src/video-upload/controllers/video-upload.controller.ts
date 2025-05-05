import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpCode,
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
  @ApiOperation({ summary: 'Create a direct upload URL for a video using a claim' })
  @ApiQuery({ name: 'claimId', required: true, description: 'Claim ID for this upload' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        originalFilename: {
          type: 'string',
          description: 'The original filename of the video',
        },
        params: {
          type: 'object',
          additionalProperties: true,
          description: 'Additional parameters for the video upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Direct upload URL created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request or invalid claim' })
  @ApiResponse({ status: 403, description: 'Claim cannot be used or user not authorized' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async createDirectUpload(
    @UserID() userId: string,
    @Query('claimId') claimId: string,
    @Body() uploadDto: Omit<ClaimBasedVideoUploadDto, 'claimId'>,
  ) {
    this.logger.log(`Received direct upload request: claimId=${claimId}, userId=${userId}`);
    return this.videoUploadService.createDirectUploadWithClaim(
      userId,
      claimId,
      uploadDto.originalFilename,
      uploadDto.params
    );
  }

  @Get('upload/:id/status')
  @ApiOperation({ summary: 'Check the status of a video upload' })
  @ApiParam({
    name: 'id',
    description: 'Upload ID to check',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async checkUploadStatus(@Param('id') uploadId: string) {
    this.logger.log(`Checking status of upload ${uploadId}`);
    return this.videoUploadService.checkUploadStatus(uploadId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific video asset' })
  @ApiParam({
    name: 'id',
    description: 'Video asset ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Video asset retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Video asset not found' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async getVideoAsset(@Param('id') assetId: string) {
    this.logger.log(`Getting video asset ${assetId}`);
    return this.videoUploadService.getVideoAsset(assetId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle webhook from video service provider' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    this.logger.log(`Received webhook: type=${body.type || 'unknown'}`);
    return this.videoUploadService.handleWebhook(body);
  }
}