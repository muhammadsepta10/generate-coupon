import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class generateCouponDTO {
  @ApiProperty()
  prefix?: string;
  @ApiProperty()
  postfix?: string;
  @ApiProperty()
  lengths: number;
  @ApiProperty()
  char?: string;
  @ApiProperty()
  count: number;
  @ApiProperty()
  project: string;
  @ApiProperty({
    enum: { alpha: 'alpha', numeric: 'numeric', alphanumeric: 'alphanumeric' },
  })
  type: 'alpha' | 'numeric' | 'alphanumeric';
}

export class BaseImageMergeDTO {
  @ApiProperty()
  width?: number;
  @ApiProperty()
  height?: number;
  @ApiProperty()
  path: string;
}

export class OverlayImageMergeDTO {
  @ApiProperty()
  path: string;
  @ApiProperty()
  width?: number;
  @ApiProperty()
  height?: number;
  @ApiProperty()
  x: number;
  @ApiProperty()
  y: number;
  @ApiProperty()
  topRadius?: number;
}

export class TextMergeDTO {
  @ApiProperty()
  value: string;
  @ApiProperty()
  size: number;
  @ApiProperty()
  fontFamily: string;
  @ApiProperty()
  color: string;
  @ApiProperty()
  x: number;
  @ApiProperty()
  y: number;
}

export class PostProcessQrDTO {
  @ApiProperty({ type: BaseImageMergeDTO })
  baseImage: BaseImageMergeDTO;
  @ApiProperty({ type: OverlayImageMergeDTO })
  overlayImage: OverlayImageMergeDTO;
  @ApiProperty({ type: TextMergeDTO })
  text: TextMergeDTO;
  @ApiProperty()
  pathSave: string;
  @ApiProperty()
  filename: string;
}

export class overLayImageDTO {
  @ApiProperty()
  x: number;
  @ApiProperty()
  y: number;
  @ApiProperty()
  height: number;
  @ApiProperty()
  width: number;
  @ApiProperty()
  topRadius: number;
  @ApiPropertyOptional()
  path?: string;
}

export class TextDTO {
  @ApiProperty()
  value: string;
  @ApiProperty()
  color: string;
  @ApiProperty()
  fontFamily: string;
  @ApiProperty()
  size: number;
  @ApiProperty()
  x: number;
  @ApiProperty()
  y: number;
}

export class postProcessImageBulkDTO {
  @ApiProperty()
  projectPath: string;
  @ApiProperty({ type: overLayImageDTO })
  overlayImage: overLayImageDTO;
  @ApiProperty({ type: TextDTO })
  text: TextDTO;
}

export class PostProcessQrPerFileDTO {
  @ApiProperty()
  qrPath: string;
  @ApiProperty()
  qrTargetPath: string;
  @ApiProperty()
  backgroundPath: string;
  @ApiProperty({ type: overLayImageDTO })
  overlayImage: overLayImageDTO;
  @ApiProperty({ type: TextDTO })
  text: TextDTO;
}

export class compareCsvAndQrDTO {
  @ApiProperty()
  csvFilePath: string;
  @ApiProperty()
  qrFilePath: string;
}

export class SplitCsvAndQrDTO {
  @ApiProperty()
  pathCsvToSplit: string;
  @ApiProperty()
  pathQrToSplit: string;
  @ApiProperty()
  targetSplit: string;
  @ApiProperty()
  numberOfSplit: number[];
}

export class QrGradientStopDTO {
  @ApiProperty()
  offset: number;
  @ApiProperty()
  color: string;
}

export class QrGradientDTO {
  @ApiProperty({ enum: ['linear', 'radial'] })
  type: 'linear' | 'radial';
  @ApiPropertyOptional()
  rotation?: number;
  @ApiProperty({ type: [QrGradientStopDTO] })
  colorStops: QrGradientStopDTO[];
}

export class QrStylingOptionsDTO {
  @ApiPropertyOptional({ default: 300 })
  width?: number;
  @ApiPropertyOptional({ default: 300 })
  height?: number;
  @ApiPropertyOptional({ default: 10 })
  margin?: number;
  @ApiPropertyOptional({
    enum: [
      'dots',
      'rounded',
      'classy',
      'classy-rounded',
      'square',
      'extra-rounded',
    ],
    default: 'square',
  })
  dotsType?: string;
  @ApiPropertyOptional({ default: '#000000' })
  dotsColor?: string;
  @ApiPropertyOptional({ type: QrGradientDTO })
  dotsGradient?: QrGradientDTO;
  @ApiPropertyOptional({
    enum: [
      'dot',
      'square',
      'extra-rounded',
      'dots',
      'rounded',
      'classy',
      'classy-rounded',
    ],
  })
  cornersSquareType?: string;
  @ApiPropertyOptional()
  cornersSquareColor?: string;
  @ApiPropertyOptional({ type: QrGradientDTO })
  cornersSquareGradient?: QrGradientDTO;
  @ApiPropertyOptional({
    enum: [
      'dot',
      'square',
      'dots',
      'rounded',
      'classy',
      'classy-rounded',
      'extra-rounded',
    ],
  })
  cornersDotType?: string;
  @ApiPropertyOptional()
  cornersDotColor?: string;
  @ApiPropertyOptional({ type: QrGradientDTO })
  cornersDotGradient?: QrGradientDTO;
  @ApiPropertyOptional({ default: '#ffffff' })
  backgroundColor?: string;
  @ApiPropertyOptional({ type: QrGradientDTO })
  backgroundGradient?: QrGradientDTO;
  @ApiPropertyOptional({ enum: ['square', 'circle'], default: 'square' })
  shape?: 'square' | 'circle';
  @ApiPropertyOptional({ enum: ['L', 'M', 'Q', 'H'], default: 'H' })
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  @ApiPropertyOptional({ description: 'Logo image path on server' })
  imagePath?: string;
  @ApiPropertyOptional({ default: 0.4, description: '0.1 - 0.5' })
  imageSize?: number;
}

export class GenerateQrDTO {
  content: string;
  filename: string;
  pathFile: string;
  parentJobId?: string | number;
  qrOptions?: QrStylingOptionsDTO;
  // Legacy fields (backward compat)
  colorRange?: [string, string];
  icon?: string;
  style?: string;
}

export class GenerateBulkQr {
  @ApiProperty()
  couponsPath: string;
  @ApiProperty()
  generatePath: string;
  @ApiPropertyOptional()
  iconPath?: string;
  @ApiPropertyOptional()
  colorRange?: [string, string];
  @ApiPropertyOptional()
  style?: string;
  @ApiPropertyOptional({ type: QrStylingOptionsDTO })
  qrOptions?: QrStylingOptionsDTO;
}

export class QrPreviewDTO {
  @ApiProperty()
  content: string;
  @ApiPropertyOptional({ type: QrStylingOptionsDTO })
  qrOptions?: QrStylingOptionsDTO;
  // Legacy fields
  @ApiPropertyOptional()
  style?: string;
  @ApiPropertyOptional({ type: [String] })
  colorRange?: [string, string];
  @ApiPropertyOptional()
  iconPath?: string;
}

export class ListQrOutputDTO {
  @ApiProperty()
  generatePath: string;
}

export class DownloadQrDTO {
  @ApiProperty()
  generatePath: string;
  @ApiPropertyOptional()
  zipName?: string;
}

export class DownloadPostProcessDTO {
  @ApiPropertyOptional()
  path?: string;
  @ApiPropertyOptional()
  zipName?: string;
  @ApiPropertyOptional()
  project?: string;
}
