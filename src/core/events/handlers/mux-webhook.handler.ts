import { Logger } from '@nestjs/common';
import { KafkaConsumerService } from '@gpe/backend-common/dist/shared/kafka/consumer';
import { EachMessagePayload } from 'kafkajs';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';

import { VideoAsset } from '../../../shared/schemas/video-asset.schema';
import { UploadClaimService } from '../../../backend-for-frontend/upload-claim/upload-claim.service';
import { BaseEvent } from '../types/base.event';
import { VideoAssetCreatedWebhookEvent, VideoAssetDeletedWebhookEvent, VideoAssetErroredWebhookEvent, VideoAssetReadyWebhookEvent } from '@mux/mux-node/resources/webhooks';
import { MuxPassTroghUplaodPayload } from 'src/shared/interfaces/mux.interface';
import { ClaimStatus } from 'src/backend-for-frontend/upload-claim/schemas/upload-claim.schema';
import { MuxUploadStatus } from '@gpe/backend-common/dist/schema/media';

/**
 * Sends the original payload and error message to the Dead Letter Queue (DLQ) and logs the result.
 *
 * @param kafkaConsumer - Kafka consumer service for DLQ operations.
 * @param originalPayload - The original Kafka message payload.
 * @param errorMessage - The error message to send to the DLQ.
 * @param eventType - The type of Mux event.
 * @param logger - Logger instance for logging.
 */
async function sendToDlqWithLogging(
    kafkaConsumer: KafkaConsumerService,
    originalPayload: EachMessagePayload,
    errorMessage: string,
    eventType: string,
    logger: Logger
): Promise<void> {
    try {
        await firstValueFrom(kafkaConsumer.sendToDlq(originalPayload, errorMessage));
        logger.log(`Mux webhook event error sent to DLQ for event type: ${eventType}`);
    } catch (dlqError: unknown) {
        logger.error(`Failed to send to DLQ: ${String(dlqError)}`);
    }
}

// parse passthrough JSON into typed payload
function parsePassthroughData(passthrough?: string): MuxPassTroghUplaodPayload {
    return JSON.parse(passthrough || '{}') as MuxPassTroghUplaodPayload;
}

// find & update asset by passTroughUploadID, warn if missing
async function findAndUpdateAssetByPassthrough(
    model: Model<VideoAsset>,
    passTroughUploadID: string,
    update: Partial<VideoAsset>,
    logger: Logger
): Promise<VideoAsset | null> {
    const asset = await model.findOneAndUpdate({ passTroughUploadID }, update, { new: true }).exec();
    if (!asset) logger.warn(`No asset found with passTroughUploadID: ${passTroughUploadID}`);
    return asset;
}

// if asset.claimId exists, update claim and log
async function updateClaimIfExists(
    asset: VideoAsset,
    svc: UploadClaimService,
    status: ClaimStatus,
    message: string,
    playbackUrl?: string,
    errorMessage?: string,
    extra?: Record<string, any>,
    logger?: Logger
): Promise<void> {
    if (!asset.claimId) return;
    const claimId = String(asset.claimId);
    await svc.updateClaimStatus(claimId, status, message, playbackUrl, errorMessage, extra);
    logger?.log(`Updated claim ${claimId} for asset ${asset._id}`);
}

/**
 * Handles the video.upload.asset_created event
 */
async function handleAssetCreated(
    muxEvent: BaseEvent<VideoAssetCreatedWebhookEvent>,
    videoAssetModel: Model<VideoAsset>,
    logger: Logger
): Promise<boolean> {
    console.log(`Mux event: ${JSON.stringify(muxEvent, null, 2)}`);
    const parsed = parsePassthroughData(muxEvent.payload.data.passthrough);

    // only update to 'processing' if asset is not already 'ready'
    const asset = await videoAssetModel.findOneAndUpdate(
        { passTroughUploadID: parsed.passTroughUploadID, status: { $ne: 'ready' } },
        {
            status: 'processing',
            muxAssetId: muxEvent.payload.object.id,
            muxUploadStatus: muxEvent.payload.data.status,
            muxInfo: muxEvent.payload.data
        },
        { new: true }
    ).exec();
    if (!asset) {
        logger.warn(`No asset found with passTroughUploadID: ${parsed.passTroughUploadID}`);
        return false;
    }

    logger.log(`Updated asset ${asset._id} with processing ID: ${muxEvent.payload.object.id}`);
    return true;
}

/**
 * Handles the video.asset.ready event
 */
async function handleAssetReady(
    muxEvent: BaseEvent<VideoAssetReadyWebhookEvent>,
    videoAssetModel: Model<VideoAsset>,
    uploadClaimService: UploadClaimService,
    logger: Logger
): Promise<boolean> {
    console.log(`Mux event: ${JSON.stringify(muxEvent, null, 2)}`);

    const parsed = parsePassthroughData(muxEvent.payload.data.passthrough);
    const ids = muxEvent.payload.data.playback_ids;
    if (!ids?.length) throw new Error(`No playback IDs for asset ${muxEvent.payload.data.id}`);
    const playId = ids[0].id;
    const url = `https://stream.mux.com/${playId}.m3u8`;

    const asset = await findAndUpdateAssetByPassthrough(
        videoAssetModel,
        parsed.passTroughUploadID,
        {
            status: 'ready',
            duration: muxEvent.payload.data.duration,
            aspectRatio: muxEvent.payload.data.aspect_ratio,
            muxInfo: muxEvent.payload.data,
            playbackUrl: url,
            gifThumbnailUrl: `https://image.mux.com/${playId}/animated.gif`,
            thumbnailUrl: `https://image.mux.com/${playId}/thumbnail.jpg`,
            resolution: muxEvent.payload.data.resolution_tier,
            muxUploadStatus: muxEvent.payload.data.status
        },
        logger
    );
    if (!asset) {
        logger.warn(`No asset found with passTroughUploadID: ${parsed.passTroughUploadID}`);
        return false;
    }

    await updateClaimIfExists(
        asset,
        uploadClaimService,
        ClaimStatus.READY,
        'Video ready for playback',
        url,
        undefined,
        {
            assetId: asset._id?.toString(),
            duration: asset.duration,
            status: asset.status,
            thumbnailUrl: asset.thumbnailUrl
        },
        logger
    );
    logger.log(`Asset ${asset._id} is now ready`);
    return true;
}

/**
 * Handles the video.asset.errored event
 */
async function handleAssetErrored(
    muxEvent: BaseEvent<VideoAssetErroredWebhookEvent>,
    videoAssetModel: Model<VideoAsset>,
    uploadClaimService: UploadClaimService,
    logger: Logger
): Promise<boolean> {
    const parsed = parsePassthroughData(muxEvent.payload.data.passthrough);
    const errMsg = muxEvent.payload.data.errors?.[0]?.message || 'Unknown processing error';

    const asset = await findAndUpdateAssetByPassthrough(
        videoAssetModel,
        parsed.passTroughUploadID,
        {
            status: 'errored',
            errorMessage: errMsg,
            muxInfo: muxEvent.payload.data,
            muxUploadStatus: muxEvent.payload.data.status
        },
        logger
    );
    if (!asset) {
        logger.warn(`No asset found with passTroughUploadID: ${parsed.passTroughUploadID}`);
        return false;
    }

    await updateClaimIfExists(asset, uploadClaimService, ClaimStatus.FAILED, 'Video processing failed', undefined, errMsg, undefined, logger);
    logger.log(`Asset ${asset._id} failed: ${errMsg}`);
    return true;
}

/**
 * Handles the video.asset.deleted event
 */
async function handleAssetDeleted(
    muxEvent: BaseEvent<VideoAssetDeletedWebhookEvent>,
    videoAssetModel: Model<VideoAsset>,
    logger: Logger
): Promise<boolean> {
    const assetId = muxEvent.payload.object.id;

    const asset = await videoAssetModel.findOneAndUpdate(
        { muxAssetId: assetId },
        { status: 'deleted' },
        { new: true }
    ).exec();

    if (!asset) {
        logger.warn(`No asset found with muxAssetId: ${assetId}`);
        return false;
    }

    logger.log(`Asset ${asset._id} marked as deleted`);
    return true;
}

/**
 * Updates the status of a VideoAsset based on a Mux webhook event.
 * Also updates the related claim status if a claimId is associated with the asset.
 *
 * @param muxEvent - The Mux webhook event to process
 * @param videoAssetModel - Mongoose model for VideoAsset
 * @param uploadClaimService - Service for updating upload claims
 * @param logger - Logger instance
 * @returns true if the event was processed successfully, false otherwise
 */
async function processEvent(
    muxEvent: BaseEvent<any>,
    videoAssetModel: Model<VideoAsset>,
    uploadClaimService: UploadClaimService,
    logger: Logger
): Promise<boolean> {
    logger.log(`Processing event of type: ${muxEvent.type}`);

    try {
        switch (muxEvent.type) {
            case 'video.upload.created':
                return await handleAssetCreated(muxEvent, videoAssetModel, logger);

            case 'video.asset.ready':
                return await handleAssetReady(muxEvent, videoAssetModel, uploadClaimService, logger);

            case 'video.asset.errored':
                return await handleAssetErrored(muxEvent, videoAssetModel, uploadClaimService, logger);

            case 'video.asset.deleted':
                return await handleAssetDeleted(muxEvent, videoAssetModel, logger);

            default:
                logger.warn(`Unhandled Mux event type: ${muxEvent.type}`);
                return false;
        }
    } catch (error) {
        logger.error(`Error processing Mux event: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
        return false;
    }
}

/**
 * Main handler for Mux webhook events.
 * Processes the event and updates the database accordingly.
 * 
 * @param event - The Mux webhook event
 * @param originalPayload - The original Kafka message payload
 * @param videoAssetModel - Mongoose model for VideoAsset
 * @param uploadClaimService - Service for managing upload claims
 * @param kafkaConsumer - Kafka consumer service for DLQ operations
 * @param logger - Logger instance
 * @returns void
 */
export async function handleMuxWebhookEvent(
    event: BaseEvent<any>,
    originalPayload: EachMessagePayload,
    videoAssetModel: Model<VideoAsset>,
    uploadClaimService: UploadClaimService,
    kafkaConsumer: KafkaConsumerService,
    logger: Logger
): Promise<void> {
    try {
        logger.log(`Processing Mux webhook event of type: ${event.type}`);

        const success = await processEvent(
            event,
            videoAssetModel,
            uploadClaimService,
            logger
        );

        if (!success) {
            logger.warn(`Mux webhook event processing did not complete successfully: ${event.type}`);
            // Send to DLQ if processing was not successful
            await sendToDlqWithLogging(
                kafkaConsumer,
                originalPayload,
                `Failed to process Mux webhook event: ${event.type}`,
                event.type,
                logger
            );
        } else {
            logger.log(`Successfully processed Mux webhook event: ${event.type}`);
        }
    } catch (error) {
        const errorMessage = `Error handling Mux webhook event: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage, error instanceof Error ? error.stack : undefined);

        await sendToDlqWithLogging(
            kafkaConsumer,
            originalPayload,
            errorMessage,
            event.type,
            logger
        );
    }
}