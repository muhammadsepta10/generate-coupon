import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { path as appRoot } from 'app-root-path';

// qr-code-styling supports Node.js via canvas + jsdom
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCodeStyling = require('qr-code-styling');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCanvas = require('canvas');

export interface QrGradientStop {
  offset: number;
  color: string;
}

export interface QrGradientOptions {
  type: 'linear' | 'radial';
  rotation?: number;
  colorStops: QrGradientStop[];
}

export interface QrStylingRenderOptions {
  data: string;
  width?: number;
  height?: number;
  margin?: number;
  image?: string; // path to logo image or data URL
  imageSize?: number; // 0.1–0.5, default 0.4
  dotsType?:
    | 'dots'
    | 'rounded'
    | 'classy'
    | 'classy-rounded'
    | 'square'
    | 'extra-rounded';
  dotsColor?: string;
  dotsGradient?: QrGradientOptions;
  cornersSquareType?:
    | 'dot'
    | 'square'
    | 'extra-rounded'
    | 'dots'
    | 'rounded'
    | 'classy'
    | 'classy-rounded';
  cornersSquareColor?: string;
  cornersSquareGradient?: QrGradientOptions;
  cornersDotType?:
    | 'dot'
    | 'square'
    | 'dots'
    | 'rounded'
    | 'classy'
    | 'classy-rounded'
    | 'extra-rounded';
  cornersDotColor?: string;
  cornersDotGradient?: QrGradientOptions;
  backgroundColor?: string;
  backgroundGradient?: QrGradientOptions;
  shape?: 'square' | 'circle';
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

@Injectable()
export class QrStylingService {
  private readonly logger = new Logger(QrStylingService.name);

  private _resolvePath(pathInput: string): string | null {
    if (!pathInput) return null;
    if (pathInput.startsWith('data:')) return pathInput;
    if (fs.existsSync(pathInput)) return pathInput;
    const baseRoot = appRoot || process.cwd();
    const normalized = pathInput.startsWith('/')
      ? pathInput.slice(1)
      : pathInput;
    const candidate = path.resolve(baseRoot, normalized);
    if (fs.existsSync(candidate)) return candidate;
    return path.resolve(baseRoot, pathInput);
  }

  private _buildOptions(opts: QrStylingRenderOptions): any {
    const width = opts.width || 300;
    const height = opts.height || 300;

    const options: any = {
      jsdom: JSDOM,
      nodeCanvas,
      type: 'canvas',
      width,
      height,
      margin: opts.margin ?? 10,
      data: opts.data,
      shape: opts.shape || 'square',
      qrOptions: {
        typeNumber: 0,
        errorCorrectionLevel: opts.errorCorrectionLevel || 'H',
      },
      dotsOptions: {
        type: opts.dotsType || 'square',
        color: opts.dotsColor || '#000000',
        roundSize: true,
      },
      backgroundOptions: {
        color: opts.backgroundColor || '#ffffff',
      },
      imageOptions: {
        saveAsBlob: true,
        hideBackgroundDots: true,
        imageSize: opts.imageSize ?? 0.4,
        margin: 5,
      },
    };

    // Gradient for dots
    if (opts.dotsGradient) {
      options.dotsOptions.gradient = opts.dotsGradient;
    }

    // Corner squares
    if (opts.cornersSquareType || opts.cornersSquareColor) {
      options.cornersSquareOptions = {
        type: opts.cornersSquareType || 'square',
        color: opts.cornersSquareColor || opts.dotsColor || '#000000',
      };
      if (opts.cornersSquareGradient) {
        options.cornersSquareOptions.gradient = opts.cornersSquareGradient;
      }
    }

    // Corner dots
    if (opts.cornersDotType || opts.cornersDotColor) {
      options.cornersDotOptions = {
        type: opts.cornersDotType || 'square',
        color: opts.cornersDotColor || opts.dotsColor || '#000000',
      };
      if (opts.cornersDotGradient) {
        options.cornersDotOptions.gradient = opts.cornersDotGradient;
      }
    }

    // Background gradient
    if (opts.backgroundGradient) {
      options.backgroundOptions.gradient = opts.backgroundGradient;
    }

    // Logo image
    if (opts.image) {
      const resolved = this._resolvePath(opts.image);
      if (resolved) {
        options.image = resolved;
      }
    }

    return options;
  }

  /**
   * Render QR code to a PNG Buffer.
   */
  async renderToBuffer(opts: QrStylingRenderOptions): Promise<Buffer> {
    const options = this._buildOptions(opts);
    const qr = new QRCodeStyling(options);
    const rawData = await qr.getRawData('png');
    if (Buffer.isBuffer(rawData)) {
      return rawData;
    }
    // Blob → Buffer (node environment)
    if (rawData && typeof rawData.arrayBuffer === 'function') {
      const ab = await rawData.arrayBuffer();
      return Buffer.from(ab);
    }
    throw new Error('Failed to render QR code to buffer');
  }

  /**
   * Render QR code and save to file.
   */
  async renderToFile(
    opts: QrStylingRenderOptions,
    filePath: string,
  ): Promise<void> {
    const buffer = await this.renderToBuffer(opts);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
  }

  /**
   * Render QR code and return as data URL (base64 PNG).
   */
  async renderToDataUrl(opts: QrStylingRenderOptions): Promise<string> {
    const buffer = await this.renderToBuffer(opts);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}
