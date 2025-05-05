import { Injectable, Logger } from '@nestjs/common';
import { AwsS3Service } from '../../aws/aws-s3.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoAsset } from '../../shared/schemas/video-asset.schema';
import { v4 as uuidv4 } from 'uuid';
import config from '../../config';
import Mux from '@mux/mux-node';

@Injectable()
export class VideoProcessorService {
  private readonly logger = new Logger(VideoProcessorService.name);
  private readonly muxClient: Mux;

  constructor(
    private readonly awsS3Service: AwsS3Service,
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
    params?: Record<string, any>,
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
      const uploadId = uuidv4();
      
      // Create a new direct upload in Mux
      const corsOrigin = new URL(config.mux.publicBaseUrl).origin;
      
      // Prepare pass-through metadata
      const passThroughData: Record<string, string> = {
        uploadId,
        userId,
        profileName
      };
      
      // Add any additional metadata that's allowed in the profile config
      if (params && profile.passThroughParams) {
        for (const key of profile.passThroughParams) {
          if (params[key]) {
            passThroughData[key] = params[key];
          }
        }
      }
      
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
        muxUploadId: uploadId,
        muxDirectUploadId: directUpload.id,
        muxUploadStatus: 'waiting',
        originalFilename,
        customParams: params,
        claimId,
      });
      
      await asset.save();
      
      this.logger.log(`Direct upload created successfully: ${directUpload.id}`);
      
      return {
        uploadId,
        uploadUrl: directUpload.url,
        asset,
        muxDirectUploadId: directUpload.id
      };
    } catch (error) {
      this.logger.error(`Error creating Mux direct upload: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Handle Mux webhook events
  async handleMuxWebhook(body: any, signature?: string) {
    try {
      // Verify the webhook signature if provided
      if (signature && config.mux.webhookSecret) {
        // In production, you should verify the signature
        // const isValid = this.verifySignature(body, signature);
        // if (!isValid) {
        //   this.logger.warn('Invalid webhook signature');
        //   return false;
        // }
      }

      const { type, data } = body;
      this.logger.log(`Processing Mux webhook event: ${type}`);

      if (!data || !data.id) {
        this.logger.warn('Webhook data is missing ID');
        return false;
      }

      // Handle different event types
      switch (type) {
        case 'video.upload.created':
          return this.handleUploadCreated(data);
        
        case 'video.upload.asset_created':
          return this.handleAssetCreated(data);
          
        case 'video.asset.ready':
          return this.handleAssetReady(data);
          
        case 'video.asset.errored':
          return this.handleAssetError(data);
          
        default:
          this.logger.log(`Unhandled webhook event type: ${type}`);
          return true; // Return true to acknowledge receipt
      }
    } catch (error) {
      this.logger.error(`Error processing Mux webhook: ${error.message}`, error.stack);
      return false;
    }
  }

  // Handle upload created event
  private async handleUploadCreated(data: any) {
    this.logger.log(`Upload created: ${data.id}`);
    // We might not need to do anything here, as we already create our record when initializing the upload
    return true;
  }

  // Handle asset created event (when upload is complete and asset is being processed)
  private async handleAssetCreated(data: any) {
    const uploadId = data.id;
    const assetId = data.asset_id;
    
    this.logger.log(`Asset created for upload ${uploadId}: ${assetId}`);

    try {
      // Try to find the upload record using the Mux direct upload ID
      const asset = await this.videoAssetModel.findOne({ muxDirectUploadId: uploadId }).exec();
      
      if (!asset) {
        this.logger.warn(`No video asset found for Mux direct upload ID: ${uploadId}`);
        return false;
      }
      
      // Update the asset with the Mux Asset ID
      asset.muxAssetId = assetId;
      asset.muxUploadStatus = 'processing';
      
      await asset.save();
      
      this.logger.log(`Updated asset ${asset._id} with Mux Asset ID: ${assetId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error handling asset created webhook: ${error.message}`, error.stack);
      return false;
    }
  }

  // Handle asset ready event (when asset is ready for playback)
  private async handleAssetReady(data: any) {
    const assetId = data.id;
    const playbackId = data.playback_ids?.[0]?.id;
    
    this.logger.log(`Asset ready: ${assetId}, playback ID: ${playbackId}`);

    try {
      // Find the asset by Mux Asset ID
      const asset = await this.videoAssetModel.findOne({ muxAssetId: assetId }).exec();
      
      if (!asset) {
        this.logger.warn(`No video asset found for Mux Asset ID: ${assetId}`);
        return false;
      }
      
      // Extract metadata from the asset
      const { duration, aspect_ratio, max_stored_resolution, created_at, tracks } = data;
      
      // Update asset record
      asset.status = 'ready';
      asset.muxUploadStatus = 'complete';
      asset.duration = duration;
      asset.aspectRatio = aspect_ratio;
      asset.resolution = max_stored_resolution;
      
      // Generate URLs for different formats
      const hlsPlaybackUrl = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : undefined;
      const mp4PlaybackUrl = playbackId ? `https://stream.mux.com/${playbackId}.mp4` : undefined;
      const thumbnailUrl = playbackId ? `https://image.mux.com/${playbackId}/thumbnail.jpg` : undefined;
      const animatedGifUrl = playbackId ? `https://image.mux.com/${playbackId}/animated.gif` : undefined;
      const posterUrl = playbackId ? `https://image.mux.com/${playbackId}/thumbnail.png?time=5` : undefined;
      
      // Update the muxInfo with more comprehensive data
      asset.muxInfo = {
        assetId: assetId,
        playbackId: playbackId,
        hlsPlaybackUrl,
        mp4PlaybackUrl,
        thumbnailUrl,
        animatedGifUrl,
        posterUrl,
        duration,
        aspectRatio: aspect_ratio,
        resolution: max_stored_resolution,
        createdAt: created_at,
        tracks: tracks || []
      };
      
      // Also update individual fields for backward compatibility
      asset.thumbnailUrl = thumbnailUrl;
      asset.gifThumbnailUrl = animatedGifUrl;
      asset.playbackUrl = hlsPlaybackUrl; // Add a direct reference to the playback URL
      
      await asset.save();
      
      this.logger.log(`Updated asset ${asset._id} as ready for playback`);
      return true;
    } catch (error) {
      this.logger.error(`Error handling asset ready webhook: ${error.message}`, error.stack);
      return false;
    }
  }

  // Handle asset error event
  private async handleAssetError(data: any) {
    const assetId = data.id;
    
    this.logger.log(`Asset error: ${assetId}`);

    try {
      // Find the asset by Mux Asset ID
      const asset = await this.videoAssetModel.findOne({ muxAssetId: assetId }).exec();
      
      if (!asset) {
        this.logger.warn(`No video asset found for Mux Asset ID: ${assetId}`);
        return false;
      }
      
      // Update asset status
      asset.status = 'errored';
      asset.muxUploadStatus = 'failed';
      asset.errorMessage = data.messages?.join(', ') || 'Unknown error processing video';
      
      await asset.save();
      
      this.logger.log(`Updated asset ${asset._id} with error status`);
      return true;
    } catch (error) {
      this.logger.error(`Error handling asset error webhook: ${error.message}`, error.stack);
      return false;
    }
  }
}