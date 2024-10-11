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

export class PostProcessQrDTO {
  baseImage: {
    width?: number;
    height?: number;
    path: string;
  };
  overlayImage: {
    path: string;
    width?: number;
    height?: number;
    x: number;
    y: number;
    topRadius?: number;
  };
  text: {
    value: string;
    size: number;
    fontFamily: string;
    color: string;
    x: number;
    y: number;
  };
  pathSave: string;
  filename: string;
}

export class postProcessImageBulkDTO {
  @ApiProperty()
  projectPath: string;
}

export class PostProcessQrPerFileDTO {
  @ApiProperty()
  qrPath: string;
  @ApiProperty()
  qrTargetPath: string;
  @ApiProperty()
  backgroundPath: string;
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
