import { ApiProperty } from "@nestjs/swagger";

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
    enum: { alpha: "alpha", numeric: "numeric", alphanumeric: "alphanumeric" },
  })
  type: "alpha" | "numeric" | "alphanumeric";
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
}

export class TextDTO {
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

export class GenerateQrDTO {
  content: string;
  colorRange: [string, string];
  filename: string;
  icon: string;
  pathFile: string;
  style:
    | "classic"
    | "rounded"
    | "wave"
    | "stain"
    | "batik"
    | "diamond"
    | "fluid";
}

export class GenerateBulkQr {
  @ApiProperty()
  couponsPath: string;
  @ApiProperty()
  generatePath: string;
  @ApiProperty()
  iconPath: string;
  @ApiProperty()
  colorRange: [string, string];
  @ApiProperty()
  style:
    | "classic"
    | "rounded"
    | "wave"
    | "stain"
    | "batik"
    | "diamond"
    | "fluid";
}
