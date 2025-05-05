import { parseEnv } from '@gpe/backend-common/dist/shared/utils';
import { GPEUserServiceConfig, MediaConfig, MuxConfig, VideoUploadProfile } from './types';
import 'dotenv/config';

import * as winston from 'winston';
import { configDotenv } from 'dotenv';

configDotenv()

const config = Object.freeze<GPEUserServiceConfig>({
  serviceName: 'gpe-media-api-service',
  db: {
    mongo: {
      connectionString: parseEnv<string>(process.env.MONGODB_URI, 'mongodb://localhost:27017/gpe-media-api-service')
    },
    kafka: {
      brokers: parseEnv<string>(process.env.KAFKA_BROKERS, 'localhost:19092'),
      clientId: parseEnv<string>(process.env.KAFKA_CLIENT_ID, 'gpe-media-api-service-d'),
      consumerGroupId: "gpe-media-api-service-deploymnet-d"
    }
  },
  auth: {
    userAuthHeader: parseEnv<string>(process.env.USER_AUTH_HEADER, 'authorization'),
    mappingTable: {
      tableName: parseEnv<string>(process.env.DYNAMODB_TABLENAME, "gpe-dev-cognito-mongo-id-map"),
      region: parseEnv<string>(process.env.DYNAMODB_REGION, "eu-central-1"),
      profile: parseEnv<string>(process.env.DYNAMODB_PROFILE, "gpe"),
    }
  },
  server: {
    port: parseEnv<number>(process.env.PORT, 3011)
  },
  logging: {
    winston: {
      level: parseEnv<string>(process.env.LOG_LEVEL, 'debug'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console()
      ]
    }
  },
  aws: {
    s3: {
      accessKeyId: parseEnv<string>(process.env.AWS_ACCESS_KEY_ID, ''),
      secretAccessKey: parseEnv<string>(process.env.AWS_SECRET_ACCESS_KEY, ''),
      region: parseEnv<string>(process.env.AWS_REGION, 'eu-central-1'),
      bucket: parseEnv<string>(process.env.AWS_S3_BUCKET, 'gpe-media-dev'),
      urlPrefix: parseEnv<string>(process.env.AWS_S3_URL_PREFIX, 'https://gpe-media-dev.s3.eu-central-1.amazonaws.com'),
      profile: parseEnv<string>(process.env.AWS_S3_PROFILE, 'gpe'),
      useProfile: parseEnv<boolean>(process.env.AWS_S3_USE_PROFILE, true)
    }
  },
  media: {
    allowedMimeTypes: parseEnv<string>(process.env.ALLOWED_MIME_TYPES, 'image/jpeg,image/png,image/webp').split(','),
    maxFileSize: parseEnv<number>(process.env.MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB default
    defaultQuality: parseEnv<number>(process.env.DEFAULT_WEBP_QUALITY, 80),
    uploadProfiles: [
      {
        name: "profile_picture",
        type: "image",
        s3: {
          bucket: parseEnv<string>(process.env.AWS_S3_BUCKET, 'gpe-media-dev'),
          prefix: "uploads/profile_pictures/",
        },
        constraints: {
          maxSize: 5 * 1024 * 1024, // 5 MB
          allowedFormats: ["jpg", "png", "gif"],
          minWidth: 100,
          minHeight: 100,
          maxWidth: 1280,
          maxHeight: 1280,
          aspectRatio: "1:1", // Square images
          allowedDeviation: 0.075, // 7.5% deviation allowed from the perfect aspect ratio
          resolutions: [
            {
              suffix: "thumbnail",
              width: 50,
              height: 50,
              quality: 80
            },
            {
              suffix: "small",
              width: 128,
              height: 128,
              quality: 85
            },
            {
              suffix: "medium",
              width: 512,
              height: 512,
              quality: 85
            }
          ]
        },
        rateLimit: {
          maxUploads: parseEnv<number>(process.env.PROFILE_PIC_MAX_UPLOADS, 300), // Default: 3 uploads
          periodDays: parseEnv<number>(process.env.PROFILE_PIC_PERIOD_DAYS, 30), // Default: 30 days
        },
      }
    ],
    moderation: {
      rules: {
        defaultThreshold: 60, // Default confidence threshold for moderation (60%)
        categories: [
          // Specific categories with custom thresholds
          {
            name: "Smoking",
            parentName: "Drugs & Tobacco Paraphernalia & Use",
            threshold: 80,
            taxonomyLevel: 3
          },
          {
            name: "Nudity",
            parentName: "Sexual Content",
            threshold: 80,
            taxonomyLevel: 2
          },
          // General moderation categories with default thresholds
          { name: "Explicit Nudity", threshold: 60 },
          { name: "Violence", threshold: 70 },
          { name: "Visually Disturbing", threshold: 70 },
          { name: "Drugs", threshold: 70 },
          { name: "Tobacco", threshold: 70 },
          { name: "Alcohol", threshold: 70 },
          { name: "Gambling", threshold: 70 },
          { name: "Hate Symbols", threshold: 60 }
        ],
        textFilterPrompt: "Return a simple YES or NO word if the following text is hateful/violent/includes nudity mentions:\nTEXT:\n{{text}}"
      },
      api: {
        groq: {
          apiUrl: parseEnv<string>(process.env.GROQ_API_URL, "https://api.groq.com/v1/inference"),
          apiKey: parseEnv<string>(process.env.GROQ_API_KEY, ""),
        },
        aws: {
          rekognition: {
            region: parseEnv<string>(process.env.AWS_REKOGNITION_REGION, process.env.AWS_REGION || "eu-central-1"),
            minConfidence: parseEnv<number>(process.env.AWS_REKOGNITION_MIN_CONFIDENCE, 60),
            useProfile: parseEnv<boolean>(process.env.AWS_REKOGNITION_USE_PROFILE, true),
            profile: parseEnv<string>(process.env.AWS_REKOGNITION_PROFILE, "gpe"),
            accessKeyId: parseEnv<string>(process.env.AWS_REKOGNITION_ACCESS_KEY_ID, ''),
            secretAccessKey: parseEnv<string>(process.env.AWS_REKOGNITION_SECRET_ACCESS_KEY, '')
          }
        }
      }
    }
  },
  mux: {
    tokenId: parseEnv<string>(process.env.MUX_TOKEN_ID, ''),
    tokenSecret: parseEnv<string>(process.env.MUX_TOKEN_SECRET, ''),
    webhookSecret: parseEnv<string>(process.env.MUX_WEBHOOK_SECRET, ''),
    publicBaseUrl: parseEnv<string>(process.env.PUBLIC_BASE_URL, 'https://api.example.com')
  },
  videoProfiles: [
    {
      name: "user_video",
      playbackPolicy: "public",
      maxDurationSeconds: 300, // 5 minutes
      maxSizeBytes: 1024 * 1024 * 500, // 500MB
      allowedFormats: ["mp4", "mov", "avi", "webm"],
      passThroughParams: ["userId", "profileName"]
    },
    {
      name: "course_content",
      playbackPolicy: "public",
      maxDurationSeconds: 3600, // 1 hour
      maxSizeBytes: 1024 * 1024 * 2000, // 2GB
      allowedFormats: ["mp4", "mov", "avi", "webm"],
      passThroughParams: ["userId", "courseId", "lessonId"]
    }
  ]
});

export default config;