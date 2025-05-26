import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoAsset } from '../../../shared/schemas/video-asset.schema';
import { v4 as uuidv4 } from 'uuid';
import config from '../../../config';
import Mux from '@mux/mux-node';
import { MuxPassTroghUplaodPayload } from 'src/shared/interfaces/mux.interface';
import { S3Service } from '@gpe/backend-common/dist/aws/s3';

@Injectable()
export class VideoProcessorService {
  private readonly logger = new Logger(VideoProcessorService.name);
  private readonly muxClient: Mux;

  constructor(
    private readonly awsS3Service: S3Service,
    @InjectModel(VideoAsset.name) private videoAssetModel: Model<VideoAsset>
  ) {
    this.logger.log('VideoProcessorService initialized');

    // Initialize Mux client
    this.muxClient = new Mux({
      tokenId: config.mux.tokenId,
      tokenSecret: config.mux.tokenSecret
    });

    if (!config.mux.tokenId || !config.mux.tokenSecret) {
      this.logger.warn('Mux API credentials not configured! Direct uploads will not work properly.');
    } else {
      this.logger.log('Mux client initialized successfully');
    }
  }

  // Mux direct upload implementation
  async createDirectUpload(
    userId: string,
    profileName: string,
    originalFilename?: string,
    claimId?: string
  ) {
    this.logger.log(`Creating direct upload for user ${userId} with profile ${profileName}`);

    // Get the profile configuration
    const profile = config.videoProfiles.find(p => p.name === profileName);
    if (!profile) {
      throw new Error(`Upload profile ${profileName} not found`);
    }

    try {
      // Generate a unique identifier for this upload
      const passTroughUploadID = uuidv4();

      // Create a new direct upload in Mux
      const corsOrigin = new URL(config.mux.publicBaseUrl).origin;

      // Prepare pass-through metadata
      const passThroughData: MuxPassTroghUplaodPayload = {
        passTroughUploadID,
        userId,
        profileName
      };

      // Create direct upload - fixing the type issues with Mux SDK
      const directUpload = await this.muxClient.video.uploads.create({
        cors_origin: corsOrigin,
        new_asset_settings: {
          playback_policy: [profile.playbackPolicy || 'public'],
          mp4_support: 'capped-1080p', // Using capped-1080p instead of standard (which is deprecated)
          passthrough: JSON.stringify(passThroughData)
        },
        test: process.env.NODE_ENV !== 'production'
      });

      // Create the asset record in the database
      const asset = new this.videoAssetModel({
        userId,
        profileName,
        passTroughUploadID,
        muxDirectUploadId: directUpload.id,
        originalFilename,
        customParams: {},
        claimId,
      });

      await asset.save();

      this.logger.log(`Direct upload created successfully: ${directUpload.id}`);

      return {
        uploadId: passTroughUploadID,
        uploadUrl: directUpload.url,
        asset,
        muxDirectUploadId: directUpload.id
      };
    } catch (error) {
      this.logger.error(`Error creating Mux direct upload: ${error.message}`, error.stack);
      throw error;
    }
  }
}