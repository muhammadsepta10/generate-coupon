import { Injectable } from "@nestjs/common";
import * as qrcode from "qrcode";
import { path as appRoot } from "app-root-path";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";
import { join, resolve } from "path";
import { AppConfigService } from "@common/config/app-config/app-config.service";

@Injectable()
export class HelperService {
  constructor(private appConfig: AppConfigService) {}

  async mergeImage({
    baseImage,
    overlayImage,
    text,
    pathSave,
    filename,
  }: {
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
  }) {
    const basePath = `${appRoot}/../`;
    const baseImagePath = resolve(`${basePath}/${baseImage.path}`);
    const overlayImagePath = resolve(`${basePath}/${overlayImage.path}`);
    const baseImageLoad = await loadImage(baseImagePath);
    const overlayImageLoad = await loadImage(overlayImagePath);
    pathSave = resolve(`${basePath}/${pathSave}`);
    if (!existsSync(pathSave)) {
      mkdirSync(pathSave, { recursive: true });
    }
    pathSave = resolve(`${pathSave}/${filename}`);

    // create canvas
    const canvas = createCanvas(baseImageLoad.width, baseImageLoad.height);
    const ctx = canvas.getContext("2d");

    // Draw base image
    ctx.drawImage(
      baseImageLoad,
      0,
      0,
      baseImageLoad.width,
      baseImageLoad.height,
    );

    // overlay option
    const overlayWidth = overlayImage.width;
    const overlayHeight = overlayImage.height;
    const overlayX = overlayImage.x;
    const overlayY = overlayImage.y;

    this._drawImageWithRoundedTopCorners(
      ctx,
      overlayImageLoad,
      overlayX,
      overlayY,
      overlayWidth,
      overlayHeight,
      overlayImage.topRadius || 0,
    );
    // ctx.drawImage(
    //   overlayImageLoad,
    //   overlayX,
    //   overlayY,
    //   overlayWidth,
    //   overlayHeight,
    // );

    ctx.font = `bold ${text.size}px ${text.fontFamily}`;
    ctx.fillStyle = text.color;
    ctx.fillText(text.value, text.x, text.y);
    // Save canvas image
    const buffer = canvas.toBuffer("image/png");
    writeFileSync(pathSave, buffer);
    return pathSave;
  }

  private _drawImageWithRoundedTopCorners(
    ctx,
    image,
    x,
    y,
    width,
    height,
    radius,
  ) {
    // Save the current context state
    ctx.save();

    // Ensure the radius doesn't exceed half the height or width
    radius = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.clip();

    // Draw the image within the clipped region
    ctx.drawImage(image, x, y, width, height);

    // Restore the context to its original state
    ctx.restore();
  }

  private _interpolateColor(color1, color2, factor) {
    const result = color1.slice(); // Copy color1 array
    for (let i = 0; i < 3; i++) {
      result[i] = Math.round(result[i] + factor * (color2[i] - result[i]));
    }
    return result;
  }

  // Convert hex to RGB array
  private _hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  private _drawBatikLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cellSize: number,
  ) {
    const amplitude = cellSize / 2;
    const thickness = cellSize / 4; // Thicker line width
    const steps = 10;

    ctx.beginPath();
    ctx.lineWidth = thickness;
    ctx.lineCap = "round"; // Rounded line caps for smooth edges

    for (let i = 0; i <= steps; i++) {
      const xx = x + (i * cellSize) / steps;
      const yy = y + Math.sin((i * Math.PI * 2) / steps) * amplitude;
      ctx.lineTo(xx, yy);
    }

    ctx.stroke();
  }

  // Helper function to draw an oval background
  private _drawOval(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    ctx.beginPath();
    ctx.ellipse(
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      2 * Math.PI,
    );
    ctx.fill();
  }

  private _drawWaterWave(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cellSize: number,
  ) {
    const amplitude = cellSize / 2; // Amplitude of the wave
    // const wavelength = cellSize * 2; // Wavelength of the wave
    const steps = 10; // Number of steps for smoother curves

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const xx = x + (i * cellSize) / steps;
      const yy = y + Math.sin((i * Math.PI * 2) / steps) * amplitude;
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  private _drawRoundedSquare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    radius: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
    ctx.fill();
  }

  private _drawStain(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ) {
    const stainRadius = size / 2;
    const numberOfBlobs = Math.floor(Math.random() * 5) + 3; // Random number of blobs
    for (let i = 0; i < numberOfBlobs; i++) {
      const blobX = x + Math.random() * size;
      const blobY = y + Math.random() * size;
      const blobRadius = Math.random() * (stainRadius / 2) + stainRadius / 4;
      ctx.beginPath();
      ctx.arc(blobX, blobY, blobRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  private _drawDiamond(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y); // Top
    ctx.lineTo(x + size, y + size / 2); // Right
    ctx.lineTo(x + size / 2, y + size); // Bottom
    ctx.lineTo(x, y + size / 2); // Left
    ctx.closePath();
    ctx.fill();
  }
  private _drawFluidPattern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y + size * 0.2);
    ctx.bezierCurveTo(
      x,
      y,
      x + size * 1.2,
      y + size * 0.4,
      x + size * 0.8,
      y + size * 1.2,
    );
    ctx.quadraticCurveTo(
      x + size * 0.6,
      y + size * 0.6,
      x + size * 0.4,
      y + size * 0.8,
    );
    ctx.closePath();
    ctx.fill();
  }

  async generateQrCode({
    content,
    style,
    colorRange,
    filename,
    pathFile,
    icon,
  }: {
    content: string;
    style:
      | "classic"
      | "rounded"
      | "wave"
      | "stain"
      | "batik"
      | "diamond"
      | "fluid";
    colorRange: [string, string];
    filename: string;
    pathFile: string;
    icon: string;
  }): Promise<string> {
    return new Promise(async (resolve) => {
      const qrSize = 500; // Size of the QR code
      const qrMargin = 10;
      // const basePath = `${appRoot}/../public/qr/${pathFile}`;
      if (!existsSync(pathFile)) {
        mkdirSync(pathFile, { recursive: true });
      }

      // Generate QR code data
      const qrCodeData = qrcode.create(content, { errorCorrectionLevel: "H" });
      const modules = qrCodeData.modules;
      const moduleCount = modules.size;

      // Calculate cell size based on actual module count
      const usableSize = qrSize - qrMargin * 2; // Area available for the QR code, excluding the margins
      const cellSize = usableSize / moduleCount;

      // Create a canvas
      const canvas = createCanvas(qrSize, qrSize);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, qrSize, qrSize);
      // Set QR code background color
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, qrSize, qrSize);

      // Extract RGB values from the colorRange
      const colorStart = this._hexToRgb(colorRange[0]); // e.g., "#000000"
      const colorEnd = this._hexToRgb(colorRange[1]); // e.g., "#FF0000"

      // Draw the QR code based on the selected style
      ctx.fillStyle = "#000000"; // QR code dots color
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (modules.get(row, col)) {
            const x = qrMargin + col * cellSize;
            const y = qrMargin + row * cellSize;
            // Calculate gradient factor based on position
            const factor = (row + col) / (moduleCount * 2); // Normalize to [0, 1]
            const [r, g, b] = this._interpolateColor(
              colorStart,
              colorEnd,
              factor,
            );

            // Set the interpolated color for the current module
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            switch (style) {
              case "classic":
                ctx.fillRect(x, y, cellSize, cellSize);
                break;
              case "diamond":
                this._drawDiamond(ctx, x, y, cellSize);
                break;
              case "rounded":
                this._drawRoundedSquare(ctx, x, y, cellSize, cellSize / 3); // Rounded corner
                break;
              case "batik":
                this._drawWaterWave(ctx, x, y, cellSize); // Water wave pattern
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 2);
                this._drawWaterWave(ctx, 0, 0, cellSize); // Rotate to draw vertical waves
                ctx.restore();
                break;
              case "wave":
                this._drawBatikLine(ctx, x, y, cellSize); // Batik-like wavy lines
                break;
              case "stain":
                this._drawStain(
                  ctx,
                  x + cellSize / 2,
                  y + cellSize / 2,
                  cellSize,
                ); // Stain-like irregular blobs
                break;
              case "fluid":
                this._drawFluidPattern(
                  ctx,
                  x + cellSize / 2,
                  y + cellSize / 2,
                  cellSize,
                ); // Stain-like irregular blobs
                break;
            }
          }
        }
      }

      if (existsSync(icon)) {
        // Load the icon and calculate positioning
        const iconImage = await loadImage(`${appRoot}/assets/icon.png`);
        const iconSize = qrSize / 5; // Icon size
        const iconX = (qrSize - iconSize) / 2;
        const iconY = (qrSize - iconSize) / 2;

        // Draw a background behind the icon using the QR code background color
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(iconX, iconY, iconSize, iconSize);
        // this._drawRoundedRectangle(ctx, iconX, iconY, iconSize, iconSize);

        // Draw the icon on top of the background
        ctx.drawImage(iconImage, iconX, iconY, iconSize, iconSize);
      }

      // Save the final image with the icon and selected QR code style
      const finalPath = join(pathFile, `${filename}.png`);
      const out = createWriteStream(finalPath);
      const stream = canvas.createPNGStream();
      stream.pipe(out);
      out.on("finish", () => {
        console.log(`QR code with ${style} style saved as ${finalPath}`);
        return resolve(finalPath);
      });
    });
  }
}
