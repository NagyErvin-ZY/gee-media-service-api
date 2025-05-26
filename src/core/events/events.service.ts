import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KafkaConsumerService } from '@gpe/backend-common/dist/shared/kafka/consumer';
import { KafkaProducerService } from '@gpe/backend-common/dist/shared/kafka/producer';
import { EachMessagePayload } from 'kafkajs';
import { UserCreatedEvent } from '@gpe/backend-common/dist/shared/kafka/events';
import { map, tap, mergeMap, catchError } from 'rxjs/operators';
import { from, Observable, of } from 'rxjs';

import { VideoAsset } from '../../shared/schemas/video-asset.schema';
import { UploadClaimService } from '../../backend-for-frontend/upload-claim/upload-claim.service';
import { handleMuxWebhookEvent } from './handlers/mux-webhook.handler';
import config from '../../config'
import { BaseEvent } from './types/base.event';

/**
 * EventsService consumes Kafka events and routes them to handlers.
 * Integrates with the KafkaConsumerService's DLQ handling mechanism for error management.
 */
@Injectable()
export class EventsService implements OnModuleInit {
    private readonly logger = new Logger(EventsService.name);

    constructor(
        private readonly kafkaConsumer: KafkaConsumerService,
        private readonly kafkaProducer: KafkaProducerService,
        private readonly uploadClaimService: UploadClaimService,
        @InjectModel(VideoAsset.name) private videoAssetModel: Model<VideoAsset>
    ) { }

    /**
     * Initialize subscription to Kafka topics when the module starts
     */
    onModuleInit(): void {
        this.subscribeToAllTopics();
    }

    /**
     * Subscribe to all configured Kafka topics
     * Uses the KafkaConsumerService's DLQ mechanism for handling errors
     */
    private subscribeToAllTopics(): void {
        const topics: string[] = Object.values(config.db.kafka.topics);
        this.logger.log(`Subscribing to topics: ${topics.join(', ')}`);

        this.kafkaConsumer
            .consume([...topics])
            .pipe(
                tap(this.logRawMessage.bind(this)),
                map(this.parseMessage.bind(this)),
                mergeMap(this.routeEvent.bind(this)),
                catchError(this.handleStreamError.bind(this))
            )
            .subscribe({
                error: this.handleFatalError.bind(this)
            });
    }

    /**
     * Log the raw message for debugging
     */
    private logRawMessage(payload: EachMessagePayload): EachMessagePayload {
        this.logger.debug(`Raw message from topic ${payload.topic}: ${payload.message.value?.toString()}`);
        return payload;
    }

    /**
     * Parse the raw Kafka message into a typed event
     */
    private parseMessage(payload: EachMessagePayload): { event: any, originalPayload: EachMessagePayload } {
        const messageValue = payload.message.value?.toString();
        if (!messageValue) {
            this.logger.warn('Received empty message value');
            const error = new Error('Empty message value');
            this.kafkaConsumer.sendToDlq(payload, error.message).subscribe();
            throw error;
        }

        try {
            const parsedEvent = JSON.parse(messageValue);

            // Validate that the event has a type
            if (!parsedEvent || !parsedEvent.type) {
                throw new Error('Event missing required type field');
            }

            this.logger.log(`Parsed event of type: ${parsedEvent.type}`);
            return { event: parsedEvent, originalPayload: payload };
        } catch (error) {
            this.logger.error('Failed to parse message', error);
            const errorMessage = `Invalid message format: ${error instanceof Error ? error.message : String(error)}`;
            this.kafkaConsumer.sendToDlq(payload, errorMessage).subscribe();
            throw new Error(errorMessage);
        }
    }

    /**
     * Route the event to the appropriate handler based on its type
     */
    private routeEvent(data: { event: BaseEvent<any>, originalPayload: EachMessagePayload }): Observable<void> {
        try {
            const { event, originalPayload } = data;
            if (originalPayload.topic.includes('mux')) {
                return from(
                    handleMuxWebhookEvent(
                        event,
                        originalPayload,
                        this.videoAssetModel,
                        this.uploadClaimService,
                        this.kafkaConsumer,
                        this.logger
                    )
                )
            } else {
                throw new Error(`No handler for event type: ${event.type} from topic: ${originalPayload.topic}`);
            }
        } catch (error) {
            return this.handleProcessingError(error, data.originalPayload);
        }
    }

    /**
     * Handle errors that occur during stream processing
     */
    private handleStreamError(error: any): Observable<void> {
        this.logger.error('Stream processing error', error);
        return of(undefined);
    }

    /**
     * Handle fatal errors that occur during subscription
     */
    private handleFatalError(error: any): void {
        this.logger.error('Fatal unhandled error in event stream', error);
    }

    /**
     * Handle errors that occur during event processing
     */
    private handleProcessingError(error: any, payload: EachMessagePayload): Observable<void> {
        this.logger.error('Error processing event', error);
        this.kafkaConsumer.sendToDlq(payload, error.message).subscribe();
        return of(undefined);
    }
}