import { IGPEAppConfig } from '@gpe/backend-common/dist/shared/config/types';

export type QuestionType = 'text' | 'multiText' | 'dob' | 'category';

export interface BaseQuestion<T extends QuestionType = QuestionType> {
  id: string;
  type: T;
  label: string;
  mandatory: boolean;
  skippable?: boolean;
  errorMessages?: string[];
}

export interface TextQuestion extends BaseQuestion<'text'> {
  placeholder?: string;
}

export interface MultiTextQuestion extends BaseQuestion<'multiText'> {
  fields: {
    id: string;
    placeholder?: string;
    errorMessages?: string[];
  }[];
}

export interface DOBQuestion extends BaseQuestion<'dob'> { }

export interface CategoryQuestion extends BaseQuestion<'category'> {
  options: {
    value: string;
    label: string;
  }[];
}

export type Question =
  | TextQuestion
  | MultiTextQuestion
  | DOBQuestion
  | CategoryQuestion;

export type OnboardingConfig = {
  questions: Question[];
};

export type KafkaConfigWithTopics = IGPEAppConfig['db']['kafka'] & {
};

export interface AWSS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  urlPrefix: string;
  profile: string; // AWS profile name
  useProfile: boolean; // Whether to use AWS profile instead of direct credentials
}

export interface ModerationCategory {
  name: string;
  parentName?: string;
  threshold: number;
  taxonomyLevel?: number;
}

export interface ModerationRules {
  categories: ModerationCategory[];
  textFilterPrompt: string;
  defaultThreshold: number;
}

export interface ModerationApiConfig {
  groq: {
    apiUrl: string;
    apiKey: string;
  };
  aws?: {
    rekognition: {
      region: string;
      minConfidence: number; // Minimum confidence threshold for moderation labels (0-100)
      moderationCategories?: string[]; // Optional specific categories to check
      profile?: string; // AWS profile name for Rekognition
      useProfile?: boolean; // Whether to use AWS profile instead of direct credentials
      accessKeyId?: string; // Optional access key ID for Rekognition
      secretAccessKey?: string; // Optional secret access key for Rekognition
    };
  };
}

export interface ImageResolution {
  width: number;
  height: number;
  quality?: number;
  suffix: string; // e.g., "thumbnail", "small", "medium"
}

export interface UploadProfileConstraints {
  maxSize: number;
  allowedFormats: string[];
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: string;
  allowedDeviation?: number; // Percentage of allowed deviation from the aspect ratio (e.g., 0.075 = 7.5%)
  resolutions?: ImageResolution[]; // Additional resolutions to generate for images
}

export interface UploadRateLimit {
  maxUploads: number;      // Maximum number of uploads allowed in the time period
  periodDays: number;      // Time period in days for the rate limit
}

export interface UploadProfileS3Config {
  bucket: string;
  prefix: string;
}

export interface UploadProfile {
  name: string;
  type: string;
  s3: UploadProfileS3Config;
  constraints: UploadProfileConstraints;
  rateLimit?: UploadRateLimit; // Optional rate limiting configuration
}

export interface MediaConfig {
  allowedMimeTypes: string[];
  maxFileSize: number; // in bytes
  defaultQuality: number; // WebP compression quality (0-100)
  uploadProfiles: UploadProfile[];
  moderation: {
    rules: ModerationRules;
    api: ModerationApiConfig;
  };
}

export interface MuxConfig {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string;
  publicBaseUrl: string;
}

export interface VideoUploadProfile {
  name: string;
  playbackPolicy: 'public' | 'signed';
  maxDurationSeconds: number;
  maxSizeBytes?: number;
  allowedFormats?: string[];
  passThroughParams?: string[];
}

export interface GPEUserServiceConfig extends IGPEAppConfig {
  db: IGPEAppConfig['db'] & {
    kafka: KafkaConfigWithTopics
  };
  aws: {
    s3: AWSS3Config;
  };
  media: MediaConfig;
  mux: MuxConfig;
  videoProfiles: VideoUploadProfile[];
}