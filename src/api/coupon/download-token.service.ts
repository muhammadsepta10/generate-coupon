import { Injectable, BadRequestException } from '@nestjs/common';
import { AppConfigService } from '@common/config/app-config/app-config.service';
import { CouponDbService } from '@database/database/mongo/coupon/coupon-db.service';
import { DownloadLinkModel } from '@database/database/mongo/coupon/interfaces/model.interface';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export interface DownloadTokenData {
  id: string;
  project: string;
  fileType: 'csv' | 'qr' | 'post-process';
  path?: string;
  zipName?: string;
  expiresAt: number;
}

@Injectable()
export class DownloadTokenService {
  private readonly downloadLinkModel: DownloadLinkModel;

  constructor(
    private readonly config: AppConfigService,
    private readonly couponDbService: CouponDbService,
  ) {
    this.downloadLinkModel = this.couponDbService.getDownloadLinkModel();
  }

  private get secret(): string {
    return this.config.DOWNLOAD_TOKEN_SECRET || 'default-dl-secret';
  }

  async generateLink(params: {
    project: string;
    fileType: 'csv' | 'qr' | 'post-process';
    path?: string;
    zipName?: string;
    password?: string;
    expiresInHours?: number;
  }): Promise<{ token: string; expiresAt: number; password: string }> {
    const id = randomBytes(24).toString('hex');
    const ttlHours = params.expiresInHours || 24;
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;

    // Auto-generate password if not provided
    const password = params.password || this._generatePassword();

    const data: DownloadTokenData = {
      id,
      project: params.project,
      fileType: params.fileType,
      path: params.path,
      zipName: params.zipName,
      expiresAt,
    };

    const passwordHash = this._hashPassword(password);

    // Sign the token
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = this._sign(payload);
    const token = `${payload}.${signature}`;

    // Store in MongoDB (TTL index auto-deletes expired docs)
    await this.downloadLinkModel.create({
      linkId: id,
      project: params.project,
      fileType: params.fileType,
      path: params.path,
      zipName: params.zipName,
      passwordHash,
      expiresAt: new Date(expiresAt),
    });

    return { token, expiresAt, password };
  }

  /** Get token metadata without validating password (for info/preview page) */
  async getTokenInfo(
    token: string,
  ): Promise<DownloadTokenData & { hasPassword: boolean }> {
    const data = this._parseAndVerifyToken(token);

    const stored = await this.downloadLinkModel
      .findOne({ linkId: data.id })
      .lean();
    if (!stored) {
      throw new BadRequestException(
        'Link download tidak ditemukan atau sudah expired',
      );
    }

    return {
      ...data,
      hasPassword: !!stored.passwordHash,
    };
  }

  /** Verify password is correct without triggering download */
  async verifyPassword(token: string, password?: string): Promise<boolean> {
    const data = this._parseAndVerifyToken(token);

    const stored = await this.downloadLinkModel
      .findOne({ linkId: data.id })
      .lean();
    if (!stored) {
      throw new BadRequestException(
        'Link download tidak ditemukan atau sudah expired',
      );
    }

    if (!stored.passwordHash) return true;
    if (!password) return false;

    const inputHash = this._hashPassword(password);
    return this._safeCompare(inputHash, stored.passwordHash);
  }

  async verifyAndGetData(
    token: string,
    password?: string,
  ): Promise<DownloadTokenData> {
    const data = this._parseAndVerifyToken(token);

    const stored = await this.downloadLinkModel
      .findOne({ linkId: data.id })
      .lean();
    if (!stored) {
      throw new BadRequestException(
        'Link download tidak ditemukan atau sudah expired',
      );
    }

    // Validate password if set
    if (stored.passwordHash) {
      if (!password) {
        throw new BadRequestException('Password diperlukan untuk download ini');
      }
      const inputHash = this._hashPassword(password);
      if (!this._safeCompare(inputHash, stored.passwordHash)) {
        throw new BadRequestException('Password salah');
      }
    }

    return data;
  }

  private _parseAndVerifyToken(token: string): DownloadTokenData {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Token tidak valid');
    }

    const [payload, signature] = parts;
    const expectedSig = this._sign(payload);
    if (!this._safeCompare(signature, expectedSig)) {
      throw new BadRequestException('Token tidak valid');
    }

    let data: DownloadTokenData;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Token tidak valid');
    }

    if (Date.now() > data.expiresAt) {
      throw new BadRequestException('Link download sudah expired');
    }

    return data;
  }

  private _generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(8);
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars[bytes[i] % chars.length];
    }
    return password;
  }

  private _sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }

  private _hashPassword(password: string): string {
    return createHmac('sha256', this.secret).update(password).digest('hex');
  }

  private _safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
