export interface UploadResult {
  id: string; // Asset ID, prefixed with 'image-'
  url: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  resolutions?: Record<string, string>; // Map of resolution names to URLs
  moderationWarning?: string; // Warning message if content moderation detected potential issues
}