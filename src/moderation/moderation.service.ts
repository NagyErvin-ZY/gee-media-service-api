import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import config from '../config';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  DetectTextCommand,
  ModerationLabel,
  TextDetection
} from '@aws-sdk/client-rekognition';
import * as CRD from '@aws-sdk/credential-providers';
import { fromEnv } from '@aws-sdk/credential-providers';
import * as sharp from 'sharp';

// AWS Rekognition has a 5MB limit for image size
const MAX_REKOGNITION_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
// Maximum dimension for Rekognition images
const MAX_AWS_DIMENSION = 1280;

export interface ModerationResult {
  isInappropriate: boolean;
  message?: string;
  detectedLabels?: Array<{
    name: string;
    confidence: number;
    parentName?: string;
  }>;
  extractedText?: string;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly groqClient: Groq;
  private readonly rekognitionClient: RekognitionClient;

  constructor() {
    this.logger.log('Initializing ModerationService');

    // Initialize Groq client for text moderation
    this.groqClient = new Groq({
      apiKey: config.media.moderation.api.groq.apiKey,
    });

    // Initialize AWS Rekognition client for image moderation and text extraction
    if (config.media.moderation.api.aws) {
      try {
        // Get region from config
        const region = config.media.moderation.api.aws.rekognition.region;

        if (config.media.moderation.api.aws.rekognition.useProfile) {
          // Use AWS profile from config
          this.rekognitionClient = new RekognitionClient({
            region,
            credentials: CRD.fromIni({
              profile: config.media.moderation.api.aws.rekognition.profile,
            }),
          });
          this.logger.log(`AWS Rekognition client initialized with profile: ${config.aws.s3.profile}`);
        } else {
          // Use explicit credentials from config
          this.rekognitionClient = new RekognitionClient({
            region,
            credentials: {
              accessKeyId: config.media.moderation.api.aws.rekognition.accessKeyId as string,
              secretAccessKey: config.media.moderation.api.aws.rekognition.secretAccessKey as string,
            }
          });
          this.logger.log(`AWS Rekognition client initialized with explicit credentials`);
        }
      } catch (error) {
        this.logger.error(`Failed to initialize AWS Rekognition client: ${error.message}`, error.stack);
        // Create a fallback client that will fail gracefully
        throw new Error('Failed to initialize AWS Rekognition client. Please check your configuration.');
      }
    }

    this.logger.log('ModerationService initialized');
  }

  /**
   * Prepare image for AWS Rekognition by converting to PNG and resizing if needed
   * Handles both format conversion and size limitations in a single operation
   * @param imageBuffer Original image buffer
   * @returns Promise with optimized image buffer for Rekognition
   */
  private async prepareImageForRekognition(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const startTime = Date.now();
      this.logger.log(`Preparing image for Rekognition. Original size: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
      
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 800;
      const height = metadata.height || 600;
      
      // Check if we need to resize or convert
      const needsProcessing = 
        metadata.format !== 'png' || 
        width > MAX_AWS_DIMENSION || 
        height > MAX_AWS_DIMENSION || 
        imageBuffer.length > MAX_REKOGNITION_IMAGE_SIZE;
      
      if (!needsProcessing) {
        this.logger.log(`Image already suitable for Rekognition (${width}x${height}, ${metadata.format}, ${(imageBuffer.length / 1024).toFixed(2)}KB)`);
        return imageBuffer;
      }
      
      // Calculate new dimensions if needed, maintaining aspect ratio
      let newWidth = width;
      let newHeight = height;
      
      if (width > MAX_AWS_DIMENSION || height > MAX_AWS_DIMENSION) {
        const aspectRatio = width / height;
        
        if (width > height && width > MAX_AWS_DIMENSION) {
          newWidth = MAX_AWS_DIMENSION;
          newHeight = Math.round(newWidth / aspectRatio);
        } else if (height > MAX_AWS_DIMENSION) {
          newHeight = MAX_AWS_DIMENSION;
          newWidth = Math.round(newHeight * aspectRatio);
        }
        
        this.logger.log(`Resizing image from ${width}x${height} to ${newWidth}x${newHeight}`);
      }
      
      // Apply all transformations in a single pipeline
      let processedImage = sharp(imageBuffer);
      
      // Resize if dimensions changed
      if (newWidth !== width || newHeight !== height) {
        processedImage = processedImage.resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Always convert to PNG format with good compression
      let processedBuffer = await processedImage
        .png({
          compressionLevel: 6,
          adaptiveFiltering: true
        })
        .toBuffer();
      
      // If still too large, apply stronger compression
      if (processedBuffer.length > MAX_REKOGNITION_IMAGE_SIZE) {
        this.logger.log(`Image still too large (${(processedBuffer.length / 1024).toFixed(2)}KB), applying stronger compression`);
        
        processedBuffer = await sharp(processedBuffer)
          .png({
            compressionLevel: 9,
            adaptiveFiltering: true
          })
          .toBuffer();
      }
      
      const totalTime = Date.now() - startTime;
      this.logger.log(`Image prepared for Rekognition: ${(processedBuffer.length / 1024).toFixed(2)}KB. Processing time: ${totalTime}ms`);
      
      return processedBuffer;
    } catch (error) {
      this.logger.error(`Error preparing image for Rekognition: ${error.message}`, error.stack);
      throw new Error(`Failed to prepare image for Rekognition: ${error.message}`);
    }
  }

  /**
   * Moderate image content using AWS Rekognition
   * @param imageBuffer The image buffer to moderate
   * @returns Promise with moderation result
   */
  async moderateImage(imageBuffer: Buffer): Promise<ModerationResult> {
    this.logger.log(`Moderating image content with AWS Rekognition. Original size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    try {
      if (!this.rekognitionClient) {
        this.logger.warn('AWS Rekognition client not configured, skipping image moderation');
        return {
          isInappropriate: false,
          message: 'AWS Rekognition configuration not available, moderation skipped',
        };
      }

      // Prepare image for Rekognition in a single step
      const processedImageBuffer = await this.prepareImageForRekognition(imageBuffer);
      
      if (processedImageBuffer.length > MAX_REKOGNITION_IMAGE_SIZE) {
        throw new Error(`Failed to resize image below required limit of ${MAX_REKOGNITION_IMAGE_SIZE} bytes. Current size: ${processedImageBuffer.length} bytes`);
      }

      this.logger.log(`Sending image to Rekognition. Size after processing: ${(processedImageBuffer.length / 1024 / 1024).toFixed(2)}MB`);

      // Send the image to AWS Rekognition for content moderation
      const moderationCommand = new DetectModerationLabelsCommand({
        Image: { Bytes: processedImageBuffer },
        MinConfidence: config.media.moderation.api.aws?.rekognition.minConfidence || 60,
      });

      const moderationResponse = await this.rekognitionClient.send(moderationCommand);
      
      this.logger.debug(`AWS Rekognition moderation response: ${JSON.stringify(moderationResponse)}`);

      // Process moderation labels
      const moderationLabels = moderationResponse.ModerationLabels || [];

      // Extract text from image for additional analysis - use the processed image buffer
      let extractedText = '';
      
      // Use the same processed buffer for text extraction
      const textDetectionCommand = new DetectTextCommand({
        Image: { Bytes: processedImageBuffer },
      });

      const textDetectionResponse = await this.rekognitionClient.send(textDetectionCommand);
      this.logger.debug(`AWS Rekognition text detection response: ${JSON.stringify(textDetectionResponse)}`);
      
      // Extract and join detected text lines
      const textDetections = textDetectionResponse.TextDetections || [];
      
      // Filter for LINE detections to avoid duplicates (Rekognition returns both WORD and LINE)
      extractedText = textDetections
        .filter(detection => detection.Type === 'LINE')
        .map(detection => detection.DetectedText)
        .filter(text => text) // Filter out undefined/null values
        .join(' ');
        
      if (extractedText.length > 0) {
        this.logger.log(`Extracted ${extractedText.length} characters of text from image`);
        
        // If text was extracted, also moderate the text content
        const textModerationResult = await this.moderateText(extractedText);

        // If the extracted text is inappropriate, add it to our moderation decision
        if (textModerationResult.isInappropriate) {
          return {
            isInappropriate: true,
            message: `Inappropriate content detected in image text: ${textModerationResult.message}`,
            detectedLabels: moderationResponse.ModerationLabels?.map(label => ({
              name: label.Name || 'Unknown',
              confidence: label.Confidence || 0,
              parentName: label.ParentName,
            })) || [],
            extractedText,
          };
        }
      }

      // Check if any of the moderation labels violate our content policies
      const violatingLabels = this.checkForContentViolations(moderationLabels);

      if (violatingLabels.length > 0) {
        const violationMessages = violatingLabels.map(label =>
          `${label.Name || 'Unknown'} (${label.Confidence?.toFixed(2)}%)`
        ).join(', ');

        return {
          isInappropriate: true,
          message: `Image contains inappropriate content: ${violationMessages}`,
          detectedLabels: moderationLabels.map(label => ({
            name: label.Name || 'Unknown',
            confidence: label.Confidence || 0,
            parentName: label.ParentName,
          })),
          extractedText,
        };
      }

      return {
        isInappropriate: false,
        message: 'Image passed content moderation checks',
        detectedLabels: moderationLabels.map(label => ({
          name: label.Name || 'Unknown',
          confidence: label.Confidence || 0,
          parentName: label.ParentName,
        })),
        extractedText,
      };

    } catch (error) {
      this.logger.error(`Error during image moderation: ${error.message}`, error.stack);
      
      // Throw a specific error type that can be caught by exception filters
      throw new Error(
        `Failed to moderate image content: ${error.message}`
      );
    }
  }

  /**
   * Extract text from an image using AWS Rekognition
   * @param imageBuffer The image buffer to analyze
   * @returns Promise with extracted text string
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    // This method is no longer used directly - text extraction is done in moderateImage
    this.logger.warn('extractTextFromImage is deprecated - text extraction is now done in moderateImage');
    return '';
  }

  /**
   * Check if any detected moderation labels violate content policies
   * @param moderationLabels Labels detected by AWS Rekognition
   * @returns Array of violating labels
   */
  private checkForContentViolations(moderationLabels: ModerationLabel[]): ModerationLabel[] {
    // Get moderation categories and default threshold from config
    const { categories, defaultThreshold } = config.media.moderation.rules;
    const violatingLabels: ModerationLabel[] = [];

    // Check each detected label against our moderation categories
    for (const label of moderationLabels) {
      // Skip if we don't have a name or confidence
      if (!label.Name || !label.Confidence) continue;

      // Find any matching category in our configuration
      const matchingCategory = categories.find(category => {
        // Direct name match
        const nameMatch = label.Name === category.name;

        // Parent name match if both are defined
        const parentMatch = label.ParentName &&
          category.parentName &&
          label.ParentName === category.parentName;

        return nameMatch || parentMatch;
      });

      // If we found a match, check if confidence exceeds threshold
      if (matchingCategory) {
        // Use category-specific threshold or fall back to default
        const threshold = matchingCategory.threshold || defaultThreshold;

        if (label.Confidence >= threshold) {
          violatingLabels.push(label);
          this.logger.log(`Content violation detected: ${label.Name} (${label.Confidence?.toFixed(2)}%) exceeds threshold of ${threshold}%`);
        }
      }
    }

    return violatingLabels;
  }

  /**
   * Moderate text content using GROQ API
   * @param text The text to moderate
   * @returns Promise with moderation result
   */
  async moderateText(text: string): Promise<ModerationResult> {
    this.logger.log('Moderating text content');

    try {
      // Prepare the prompt for text moderation
      const promptTemplate = config.media.moderation.rules.textFilterPrompt;
      const prompt = promptTemplate.replace('{{text}}', text);

      // Call GROQ API
      const response = await this.groqClient.chat.completions.create({
        model: 'gemma2-9b-it',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0, // Use 0 for deterministic responses
        max_tokens: 5, // We only need a short YES/NO response
      });

      // Parse the response and look for "YES" in content
      const content = response.choices[0]?.message?.content || '';
      const isInappropriate = content.trim().toUpperCase().includes('YES');

      this.logger.log(`Text moderation result: ${isInappropriate ? 'Rejected' : 'Approved'}`);

      return {
        isInappropriate,
        message: isInappropriate ? 'Text contains inappropriate content' : 'Text passed moderation check',
      };
    } catch (error) {
      this.logger.error(`Error during text moderation: ${error.message}`, error.stack);
      // In case of errors, we'll allow the content through but log the error
      return {
        isInappropriate: false,
        message: 'Moderation check skipped due to error',
      };
    }
  }
}