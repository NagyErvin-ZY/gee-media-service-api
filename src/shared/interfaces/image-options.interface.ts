export interface ResolutionOption {
  width: number;
  height: number;
  quality?: number;
  suffix: string; // e.g., "thumbnail", "small", "medium"
}

export interface ImageOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  width?: number;
  height?: number;
  format?: string;
  aspectRatio?: string; // e.g. '1:1', '16:9'
  allowedDeviation?: number; // e.g. 0.075 for 7.5%
  resolutions?: ResolutionOption[]; // Additional resolutions to generate
}