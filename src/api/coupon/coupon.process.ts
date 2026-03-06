import { CouponDbService } from '@database/database/mongo/coupon/coupon-db.service';
import { DBModel } from '@database/database/mongo/coupon/interfaces/model.interface';
import {
  GenerateBulkQr,
  generateCouponDTO,
  GenerateQrDTO,
  PostProcessQrDTO,
  PostProcessQrPerFileDTO,
} from './coupon.dto';
import { path as appRoot } from 'app-root-path';
const firstTypeChar = 0;
const alphanumericArr = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
];
import * as fs from 'node:fs';
import { createReadStream } from 'node:fs';
import { randomInt } from 'node:crypto';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
let idx = 0;
import { format, formatDistanceToNowStrict } from 'date-fns';
import { resolve } from 'node:path';
import { HelperService } from '@common/helper/helper.service';
import { QrStylingService } from '@common/helper/qr-styling.service';
import { createInterface } from 'node:readline';
let generated = 0;

class SeededRandom {
  private seed: number;
  static readonly MODULUS = 2_147_483_647;
  private static readonly MULTIPLIER = 16_807;

  constructor(seed: number) {
    let normalizedSeed = Math.floor(seed) % SeededRandom.MODULUS;
    if (normalizedSeed <= 0) {
      normalizedSeed += SeededRandom.MODULUS - 1;
    }
    this.seed = normalizedSeed;
  }

  next(): number {
    this.seed = (this.seed * SeededRandom.MULTIPLIER) % SeededRandom.MODULUS;
    return this.seed;
  }

  nextFloat(): number {
    return (this.next() - 1) / (SeededRandom.MODULUS - 1);
  }

  nextInt(min: number, max: number): number {
    if (max < min) {
      throw new Error('Invalid range for random int generation');
    }
    const span = max - min + 1;
    return min + Math.floor(this.nextFloat() * span);
  }
}

const DEFAULT_DB_CHUNK_SIZE = 2_000;
const DEFAULT_BULK_WRITE_CHUNK = 5_000;
const PROGRESS_SEGMENTS = 20;
const QR_QUEUE_BATCH_SIZE = 1_000;
const MERGE_QUEUE_BATCH_SIZE = 500;

const chunkArray = <T>(values: T[], size: number) => {
  if (size <= 0) {
    return [values];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const deriveNumericSeed = <T>(job: Job<T>) => {
  const basis = `${job.id ?? ''}:${job.name ?? ''}:${job.timestamp ?? ''}`;
  let hash = 0;
  for (let index = 0; index < basis.length; index++) {
    hash = (hash * 31 + basis.charCodeAt(index)) | 0;
  }
  hash = Math.abs(hash);
  if (hash === 0) {
    hash = Math.floor(Date.now() % SeededRandom.MODULUS);
  }
  return hash;
};

// Yield ke event loop agar Bull bisa heartbeat ke Redis
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Format seconds into human-readable ETA string.
 */
function formatEta(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d < 7) return `${d}d ${rh}h`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    const rd = d % 7;
    return `${w}w ${rd}d`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    const rd = d % 30;
    return `${mo}mo ${rd}d`;
  }
  const y = Math.floor(d / 365);
  const rmo = Math.floor((d % 365) / 30);
  return `${y}y ${rmo}mo`;
}

@Processor('coupon')
export class CouponProcess {
  private couponModels: DBModel;
  private rng: SeededRandom | null = null;
  constructor(private readonly couponDbService: CouponDbService) {
    this.couponModels = this.couponDbService.getModels();
  }

  _randomInt(min: number, max: number) {
    if (!this.rng) {
      this.rng = new SeededRandom(Math.floor(Date.now()));
    }
    return this.rng.nextInt(min, max);
  }

  _randomElem(arr: string) {
    return arr[this._randomInt(0, arr.length - 1)];
  }

  _generateOne2(
    charset: string,
    postfix: string,
    prefix: string,
    length: number,
  ) {
    let code = '';
    while (length - prefix.length > 0) {
      const candidateChar = this._randomElem(charset);
      if (code.includes(candidateChar)) {
        continue;
      }
      code += candidateChar;
      length -= 1;
    }
    return prefix + code + postfix;
  }

  _checkCodeV4(code: string, codeBfr: string, codeAftr: string) {
    const codeFirst = code.substring(1, 3);
    const codeLast = code.substring(5, 7);
    const codeBfrFirst = codeBfr.substring(0, 2);
    const codeBfrLast = codeBfr.substring(5, 7);
    const codeAftrFirst = codeAftr.substring(0, 2);
    const codeAftrLast = codeAftr.substring(5, 7);
    if (
      codeFirst[0] === (codeBfrFirst?.[0] || '') &&
      codeLast[0] === (codeBfrLast?.[0] || '')
    ) {
      const codeLastIdx = alphanumericArr.indexOf(codeLast[1]);
      const codeBfrLastIdx = alphanumericArr.indexOf(codeBfrLast[1]);
      const checkIdxLast = codeLastIdx - codeBfrLastIdx;
      if (
        codeFirst[1] === (codeBfrFirst?.[1] || '') &&
        (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10
      ) {
        const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1]);
        const codeBfrFirstIdx = alphanumericArr.indexOf(codeBfrFirst[1]);
        const checkIdx = codeFirstIdx - codeBfrFirstIdx;
        if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
          return false;
        }
      }
    }
    if (
      codeFirst[0] === (codeAftrFirst?.[0] || '') &&
      codeLast[0] === (codeAftrLast?.[0] || '')
    ) {
      const codeLastIdx = alphanumericArr.indexOf(codeLast[1]);
      const codeAftrLastIdx = alphanumericArr.indexOf(codeAftrLast[1]);
      const checkIdxLast = codeLastIdx - codeAftrLastIdx;
      if (
        codeFirst[1] === (codeAftrFirst?.[1] || '') &&
        (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10
      ) {
        const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1]);
        const codeAftrFirstIdx = alphanumericArr.indexOf(codeAftrFirst[1]);
        const checkIdx = codeFirstIdx - codeAftrFirstIdx;
        if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
          return false;
        }
      }
    }
    // if (codeFirst[0] === (codeAftrFirst?.[0] || "")) {
    //     if (codeFirst[1] === (codeAftrFirst?.[1] || "")) {
    //         const codeFirstIdx = alphanumericArr.indexOf(codeFirst[2])
    //         const codeAftrFirstIdx = alphanumericArr.indexOf(codeAftrFirst[2])
    //         const checkIdx = codeFirstIdx - codeAftrFirstIdx
    //         if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 1) {
    //             return false
    //         }
    //     }
    // }
    // // if (codeLast[0] === (codeBfrLast?.[0] || "")) {
    // //     const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
    // //     const codeBfrLastIdx = alphanumericArr.indexOf(codeBfrLast[1])
    // //     const checkIdx = codeLastIdx - codeBfrLastIdx
    // //     if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 1) {
    // //         return false
    // //     }
    // // }
    // if (codeLast[0] === (codeAftrLast?.[0] || "")) {
    //     const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
    //     const codeAftrLastIdx = alphanumericArr.indexOf(codeAftrLast[1])
    //     const checkIdx = codeLastIdx - codeAftrLastIdx
    //     if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 1) {
    //         return false
    //     }

    // }
    return true;
  }

  @Process()
  async generateCoupon(job: Job<generateCouponDTO>) {
    const config = job.data;
    this.rng = new SeededRandom(deriveNumericSeed(job));
    const codes: Record<string, boolean> = {};
    const count = config.count;
    let validCode = 0;
    while (validCode === 0) {
      while (config.count > 0) {
        const code = this._generateOne2(
          config.char,
          config.postfix,
          config.prefix,
          config.lengths,
        );
        // let code = `${config.prefix}${code1.substring(3, 8)}`
        // const firstCode = code.substring(3, 5)
        // const scndCode = code.substring(3, 7)
        // if ((scnd[scndCode] || 0) < 6) {
        // const checkCode = checkCodeSort(Object.keys(codes), code)
        // console.log(checkCode)
        const isNumeric =
          code
            .replace(config.prefix, '')
            .replace(config.postfix, '')
            .search(/.*([0-9]).*/) < 0
            ? false
            : true;
        const isAlpha =
          code
            .replace(config.prefix, '')
            .replace(config.postfix, '')
            .search(/.*([a-zA-Z]).*/) < 0
            ? false
            : true;
        const alphanumCheck =
          config.type === 'alpha'
            ? isAlpha
            : config.type === 'numeric'
            ? isNumeric
            : isNumeric && isAlpha;
        const checkCode = await this.couponModels.Coupons.Coupons.findOne({
          coupon: code,
        });
        if (!checkCode && codes[code] === undefined && alphanumCheck) {
          // first[firstCode] ? first[firstCode] += 1 : first[firstCode] = 1
          // scnd[scndCode] ? scnd[scndCode] += 1 : scnd[scndCode] = 1
          // firstTypeChar = firstTypeChar == 0 ? 1 : 0
          config.count--;
          codes[code] = true;
          // await models.coupon.create({coupon: code}).then(() => {
          //     config.count--;
          //     codes[code] = true
          console.log(
            'code generate',
            count - config.count,
            code,
            firstTypeChar,
          );
          // }).catch((err) => {
          //     console.log("error")
          // })
          // codes[code] = true
          // fs.writeFileSync("./validatecode.csv", Object.keys(codes).sort().join("\r\n"))
        }
        // }
      }
      // const arrCode = Object.keys(codes)
      // let lastIdx = 0
      // const counInsert = 200
      // for (let index = 0; index < arrCode.length / counInsert; index++) {
      //     let arrInsert: {coupon: string}[] = arrCode.slice(lastIdx, lastIdx + 1 + counInsert).map(v => {return {coupon: v}})
      //     await models.coupon.insertMany(arrInsert).catch(err => {
      //         console.log(err)
      //     })
      // }
      // process.exit()
      // const sortedCode = await models.coupon.find().sort({coupon: 1})
      // let lastIdx = 0
      // const counInsert = 1000
      // for (let index = 0; index < sortedCode.length / counInsert; index++) {
      //     const arr = sortedCode.slice(lastIdx, (lastIdx + counInsert))
      //     lastIdx += counInsert
      //     let countLoop = 0
      //     while (countLoop < arr.length) {
      //         const code = arr[countLoop].coupon
      //         const codeBfr = arr[countLoop - 1]?.coupon
      //         const codeAftr = arr[countLoop + 1]?.coupon
      //         const checkCode = checkCodeV4(code || "", codeBfr || "", codeAftr || "")
      //         if (!checkCode) {
      //             await models.coupon.deleteOne({coupon: code})
      //             config.count++
      //         }
      //         countLoop++
      //     }
      // }
      // for (let index = 0; index < sortedCode.length / counInsert; index++) {
      const sortedCode = Object.keys(codes);
      let countLoop = 0;
      while (countLoop < sortedCode.length) {
        const code = sortedCode[countLoop];
        const codeBfr = sortedCode[countLoop - 1];
        const codeAftr = sortedCode[countLoop + 1];
        const checkCode = this._checkCodeV4(
          code || '',
          codeBfr || '',
          codeAftr || '',
        );
        if (!checkCode) {
          delete codes[code];
          config.count++;
        }
        countLoop++;
      }
      // }
      console.log(count - config.count, config.count);
      // process.exit()
      if (config.count < 1) {
        validCode = 1;
      }
    }
    const arrCode = Object.keys(codes);
    let lastIdx = 0;
    const counInsert = 100000;
    for (let index = 0; index < arrCode.length / counInsert; index++) {
      const sliceArr: { coupon: string; project: string }[] = arrCode
        .slice(lastIdx, counInsert + lastIdx)
        .map((v) => {
          return { coupon: v, project: config.project };
        });
      const sliceArrCoupon: string[] = arrCode
        .slice(lastIdx, counInsert + lastIdx)
        .map((v) => {
          return v;
        });
      await this.couponModels.Coupons.Coupons.insertMany(sliceArr);
      await this._writeCsv(
        sliceArrCoupon,
        config.project,
        config.prefix,
        config.postfix,
      );
      lastIdx += counInsert;
    }
    this.rng = null;
    return true;
  }

  _writeCsv(data: any[], project: string, prefix: string, postfix: string) {
    const originName =
      prefix !== '' ? prefix : postfix !== '' ? postfix : project;
    let name = originName;
    const dirPath = `${appRoot}/public/coupons/csv/${project}`;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    while (fs.existsSync(`${dirPath}/${name}.csv`)) {
      name = originName;
      name = `${name}-${idx}`;
      idx++;
    }
    data.unshift('coupon');
    fs.writeFile(`${dirPath}/${name}.csv`, data.join('\r\n'), (err) => {
      if (err) {
        console.log('error create', err);
      } else {
        console.log('Success create');
      }
    });
    return true;
  }
}

@Processor('coupon2')
export class CouponProcess2 {
  private couponModels: DBModel;
  private readonly limitPerLoop = 500_000;
  private readonly generationChunkSize = 10_000;
  private readonly candidateOversampleFactor = 1.2;
  private readonly dbChunkSize = DEFAULT_DB_CHUNK_SIZE;
  private readonly bulkWriteChunk = DEFAULT_BULK_WRITE_CHUNK;
  constructor(private readonly couponDbService: CouponDbService) {
    this.couponModels = this.couponDbService.getModels();
  }

  /**
   * Fisher-Yates shuffle untuk generate kode unik anti-sequential.
   * - Setiap karakter dalam 1 kode TIDAK berulang (unique chars)
   * - Urutan acak sempurna (crypto.randomInt)
   * - O(n) tanpa retry loop → tidak memblokir event loop
   * - Kode ABCD1234FG tidak akan menghasilkan ABCD1235FG
   */
  private generateOneCode(
    charset: string,
    postfix: string,
    prefix: string,
    totalLength: number,
  ): string {
    const resolvedCharset =
      charset && charset.length > 0 ? charset : alphanumericArr.join('');
    const availableLength = totalLength - prefix.length - postfix.length;
    if (availableLength <= 0) {
      throw new Error(
        'Invalid configuration: lengths must be greater than prefix + postfix length',
      );
    }

    if (resolvedCharset.length >= availableLength) {
      // Fisher-Yates partial shuffle: ambil availableLength karakter unik
      // dari charset secara acak tanpa retry loop
      const pool = resolvedCharset.split('');
      const code: string[] = new Array(availableLength);
      for (let i = 0; i < availableLength; i++) {
        const lastIdx = pool.length - 1 - i;
        const j = randomInt(0, lastIdx + 1);
        code[i] = pool[j];
        // Swap: pindahkan karakter yang sudah diambil ke akhir pool
        pool[j] = pool[lastIdx];
      }
      return `${prefix}${code.join('')}${postfix}`;
    } else {
      // Fallback: charset lebih kecil dari panjang kode → izinkan berulang
      let code = '';
      while (code.length < availableLength) {
        code += resolvedCharset[randomInt(0, resolvedCharset.length)];
      }
      return `${prefix}${code}${postfix}`;
    }
  }

  private isCodeTypeValid(
    code: string,
    type: generateCouponDTO['type'],
    prefix: string,
    postfix: string,
  ) {
    const core = code.slice(prefix.length, code.length - postfix.length);
    const hasNumeric = /\d/.test(core);
    const hasAlpha = /[a-zA-Z]/.test(core);
    if (type === 'alpha') {
      return hasAlpha;
    }
    if (type === 'numeric') {
      return hasNumeric;
    }
    return hasAlpha && hasNumeric;
  }

  /**
   * insertMany ordered:false → MongoDB unique index handles duplicates.
   * - 1 index lookup per doc (vs 2 for bulkWrite upsert: find + insert)
   * - 50% less disk I/O on 15GB index
   * - Partial success: yang unik masuk, yang duplikat di-skip
   */
  private async persistCoupons(codes: string[], project: string) {
    if (!codes.length) {
      return { inserted: [] as string[], duplicates: [] as string[] };
    }

    const inserted: string[] = [];
    const duplicates: string[] = [];

    for (const chunk of chunkArray(codes, this.bulkWriteChunk)) {
      if (!chunk.length) {
        continue;
      }
      try {
        const docs = chunk.map((coupon) => ({ coupon, project }));
        await this.couponModels.Coupons.Coupons.insertMany(docs, {
          ordered: false,
        });
        // Semua berhasil insert
        chunk.forEach((c) => inserted.push(c));
      } catch (err: any) {
        if (err?.code === 11000 || err?.name === 'MongoBulkWriteError') {
          // Partial success: sebagian masuk, sebagian duplicate (E11000)
          const writeErrors: any[] = err?.writeErrors ?? [];
          const failedIndexes = new Set<number>();
          for (const writeErr of writeErrors) {
            failedIndexes.add(writeErr.index);
          }
          chunk.forEach((code, i) => {
            if (failedIndexes.has(i)) {
              duplicates.push(code);
            } else {
              inserted.push(code);
            }
          });
        } else {
          console.error('persistCoupons unexpected error:', err?.message);
          chunk.forEach((c) => duplicates.push(c));
        }
      }
    }

    return { inserted, duplicates };
  }

  private async generateCandidateSet(
    target: number,
    charset: string,
    postfix: string,
    prefix: string,
    totalLength: number,
    type: generateCouponDTO['type'],
    blocked?: Set<string>,
  ) {
    const desiredSize = Math.max(
      target,
      Math.ceil(target * this.candidateOversampleFactor),
    );
    const candidates = new Set<string>();
    const maxAttempts = Math.max(desiredSize * 5, 1000);
    let attempts = 0;
    let yieldCounter = 0;

    while (candidates.size < desiredSize && attempts < maxAttempts) {
      attempts++;
      yieldCounter++;

      // Yield ke event loop setiap 10K iterasi
      // KRITIS: tanpa ini Bull kehilangan lock dan job jadi stalled
      if (yieldCounter >= 10_000) {
        yieldCounter = 0;
        await yieldToEventLoop();
      }

      const candidate = this.generateOneCode(
        charset,
        postfix,
        prefix,
        totalLength,
      );
      if (blocked?.has(candidate) || candidates.has(candidate)) {
        continue;
      }
      if (!this.isCodeTypeValid(candidate, type, prefix, postfix)) {
        continue;
      }
      candidates.add(candidate);
    }

    if (candidates.size === 0) {
      throw new Error(
        'Unable to generate any coupon codes. Check charset/length configuration.',
      );
    }
    if (candidates.size < target) {
      console.warn(
        `generateCandidateSet: only got ${candidates.size}/${target} after ${attempts} attempts`,
      );
    }
    return Array.from(candidates);
  }

  private async generateAndPersistBatch(params: {
    target: number;
    charset: string;
    postfix: string;
    prefix: string;
    totalLength: number;
    type: generateCouponDTO['type'];
    project: string;
    loopIndex: number;
    loopTotal: number;
    /** Stable WS job ID across all loops */
    wsJobId: string;
    /** Grand total across all loops (= original requested count) */
    grandTotal: number;
    /** How many codes were already inserted in previous loops */
    grandOffset: number;
    /** Bull job reference for progress reporting */
    job: Job<generateCouponDTO>;
  }) {
    const {
      target,
      charset,
      postfix,
      prefix,
      totalLength,
      type,
      project,
      loopIndex,
      loopTotal,
      wsJobId,
      grandTotal,
      grandOffset,
      job: parentJob,
    } = params;

    // TIDAK menggunakan insertedSet/inserted[] yang terus tumbuh di memory
    let totalInserted = 0;
    const rejectedSet = new Set<string>();
    const rejectedQueue: string[] = [];
    const rejectedCacheLimit = 50_000;
    const rememberRejected = (code: string) => {
      if (!code || rejectedSet.has(code)) {
        return;
      }
      rejectedSet.add(code);
      rejectedQueue.push(code);
      if (rejectedQueue.length > rejectedCacheLimit) {
        const oldest = rejectedQueue.shift();
        if (oldest) {
          rejectedSet.delete(oldest);
        }
      }
    };
    const startTime = new Date();
    const startLabel = format(startTime, 'yyyy-MM-dd HH:mm:ss');
    let attemptsWithoutProgress = 0;
    const progressInterval = Math.max(
      Math.floor(target / PROGRESS_SEGMENTS),
      5_000,
    );
    let lastLoggedProgress = 0;

    // Init CSV file untuk append per batch
    const csvFilePath = this.initCsvFilePath(
      project,
      prefix,
      postfix,
      loopIndex,
    );
    await fs.promises.writeFile(csvFilePath, 'coupon\r\n', {
      encoding: 'utf8',
    });

    console.log(
      `=== BATCH START === loop ${
        loopIndex + 1
      }/${loopTotal}, target: ${target}, started: ${startLabel}, csv: ${csvFilePath}`,
    );

    let batchCount = 0;

    while (totalInserted < target) {
      const remaining = target - totalInserted;
      const batchSize = Math.min(remaining, this.generationChunkSize);
      const batchStart = Date.now();
      batchCount++;

      // generateCandidateSet sekarang async (dengan yield ke event loop)
      const candidates = await this.generateCandidateSet(
        batchSize,
        charset,
        postfix,
        prefix,
        totalLength,
        type,
        rejectedSet,
      );

      const generateMs = Date.now() - batchStart;

      // Langsung persist via insertMany ordered:false
      // MongoDB unique index handle duplicate — skip findExistingCoupons
      const persistStart = Date.now();
      const { inserted: newlyInserted, duplicates: duplicatesOnInsert } =
        await this.persistCoupons(candidates.slice(0, batchSize), project);
      const persistMs = Date.now() - persistStart;

      duplicatesOnInsert.forEach((code) => rememberRejected(code));

      if (newlyInserted.length === 0) {
        attemptsWithoutProgress++;
        console.warn(
          `[loop ${
            loopIndex + 1
          }] batch #${batchCount} — 0 inserts, attempt ${attemptsWithoutProgress}/50`,
        );
        if (attemptsWithoutProgress > 50) {
          throw new Error(
            'Generation stalled — all candidates are duplicates.',
          );
        }
        continue;
      }

      attemptsWithoutProgress = 0;
      totalInserted += newlyInserted.length;

      // Tulis CSV secara append — tidak akumulasi di memory
      await fs.promises.appendFile(
        csvFilePath,
        newlyInserted.join('\r\n') + '\r\n',
        { encoding: 'utf8' },
      );

      // Speed metrics
      const batchTotalMs = Date.now() - batchStart;
      const speed =
        batchTotalMs > 0
          ? Math.round((newlyInserted.length / batchTotalMs) * 1000)
          : 0;
      const elapsedSec = (Date.now() - startTime.getTime()) / 1000;
      const overallSpeed =
        elapsedSec > 0 ? Math.round(totalInserted / elapsedSec) : 0;
      const eta =
        overallSpeed > 0
          ? Math.round((target - totalInserted) / overallSpeed)
          : 0;
      const etaMin = Math.floor(eta / 60);
      const etaSec = eta % 60;

      if (
        totalInserted - lastLoggedProgress >= progressInterval ||
        totalInserted >= target
      ) {
        lastLoggedProgress = totalInserted;
        const mem = process.memoryUsage();
        const pct = ((totalInserted / target) * 100).toFixed(1);

        // Emit CUMULATIVE progress via WebSocket (across all loops)
        const cumProcessed = grandOffset + totalInserted;
        const cumPct = Number(((cumProcessed / grandTotal) * 100).toFixed(1));
        const cumRemaining = grandTotal - cumProcessed;
        const cumEta =
          overallSpeed > 0 ? Math.round(cumRemaining / overallSpeed) : 0;
        const etaStr = formatEta(cumEta) || 'calculating...';
        parentJob.progress({
          jobId: wsJobId,
          jobType: 'generate-coupon',
          queue: 'coupon2',
          processed: cumProcessed,
          total: grandTotal,
          speed: overallSpeed,
          pct: cumPct,
          percentage: cumPct,
          status: cumProcessed >= grandTotal ? 'completed' : 'active',
          eta: etaStr,
          label: `Coupon ${project}`,
        });

        console.log(
          `[coupon] loop ${loopIndex + 1}/${loopTotal}` +
            ` | ${totalInserted.toLocaleString()}/${target.toLocaleString()} (${pct}%)` +
            ` | batch #${batchCount}: +${newlyInserted.length} ok, ${duplicatesOnInsert.length} dupes` +
            ` | speed: ${speed.toLocaleString()} codes/sec (batch) ${overallSpeed.toLocaleString()} codes/sec (avg)` +
            ` | gen ${generateMs}ms, db ${persistMs}ms` +
            ` | ETA ${etaMin}m${etaSec}s` +
            ` | elapsed ${formatDistanceToNowStrict(startTime)}` +
            ` | heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB` +
            ` | rejectedCache ${rejectedSet.size}`,
        );
      }
    }

    const totalElapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    const finalSpeed = Math.round(totalInserted / Number(totalElapsed));
    console.log(
      `=== BATCH DONE === loop ${loopIndex + 1}/${loopTotal}` +
        ` | inserted: ${totalInserted.toLocaleString()}` +
        ` | ${batchCount} batches, ${totalElapsed}s` +
        ` | avg ${finalSpeed.toLocaleString()} codes/sec`,
    );
    return totalInserted;
  }

  private initCsvFilePath(
    project: string,
    prefix: string,
    postfix: string,
    loopIndex: number,
  ): string {
    const originName =
      prefix !== '' ? prefix : postfix !== '' ? postfix : project;
    const dirPath = `${appRoot}/public/coupons/csv/${project}`;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    let fileName = `${originName}-loop${loopIndex}`;
    let counter = 0;
    while (fs.existsSync(`${dirPath}/${fileName}.csv`)) {
      fileName = `${originName}-loop${loopIndex}-${counter}`;
      counter++;
    }
    return `${dirPath}/${fileName}.csv`;
  }

  @Process()
  async generateCoupon(job: Job<generateCouponDTO>) {
    const {
      lengths,
      count,
      project,
      type,
      char,
      postfix = '',
      prefix = '',
    } = job.data;
    const charset = char && char.length > 0 ? char : alphanumericArr.join('');

    console.log(
      '=== JOB START ===',
      JSON.stringify({
        jobId: job.id,
        count,
        lengths,
        charsetLength: charset.length,
        charset,
        project,
        type,
        prefix: prefix || '(none)',
        postfix: postfix || '(none)',
        timestamp: new Date().toISOString(),
      }),
    );

    const totalLoop = Math.ceil(count / this.limitPerLoop);
    let remaining = count;
    let grandOffset = 0;
    const wsJobId = `coupon2-${job.id}`;
    // Tidak perlu SeededRandom — menggunakan crypto.randomInt

    for (let loopIndex = 0; loopIndex < totalLoop; loopIndex++) {
      const chunkTarget = Math.min(remaining, this.limitPerLoop);
      console.log(
        `=== LOOP ${
          loopIndex + 1
        }/${totalLoop} === target: ${chunkTarget}, remaining: ${remaining}`,
      );

      const insertedCount = await this.generateAndPersistBatch({
        target: chunkTarget,
        charset,
        postfix,
        prefix,
        totalLength: lengths,
        type,
        project,
        loopIndex,
        loopTotal: totalLoop,
        wsJobId,
        grandTotal: count,
        grandOffset,
        job,
      });
      remaining -= insertedCount;
      grandOffset += insertedCount;
      // CSV sudah ditulis per batch di generateAndPersistBatch
    }

    console.log(
      '=== JOB COMPLETE ===',
      JSON.stringify({
        jobId: job.id,
        requested: count,
        generated: count - remaining,
      }),
    );
  }
}

@Processor('generate-qr')
export class GenerateQr {
  constructor(
    private helperService: HelperService,
    private qrStylingService: QrStylingService,
  ) {}

  @Process({ concurrency: 5 })
  async generateQr(job: Job<GenerateQrDTO>) {
    const { content, filename, pathFile, qrOptions } = job.data;

    // New qr-code-styling path
    if (qrOptions) {
      const filePath = resolve(`${pathFile}/${filename}.png`);
      await this.qrStylingService.renderToFile(
        {
          data: content,
          width: qrOptions.width,
          height: qrOptions.height,
          margin: qrOptions.margin,
          dotsType: qrOptions.dotsType as any,
          dotsColor: qrOptions.dotsColor,
          dotsGradient: qrOptions.dotsGradient as any,
          cornersSquareType: qrOptions.cornersSquareType as any,
          cornersSquareColor: qrOptions.cornersSquareColor,
          cornersSquareGradient: qrOptions.cornersSquareGradient as any,
          cornersDotType: qrOptions.cornersDotType as any,
          cornersDotColor: qrOptions.cornersDotColor,
          cornersDotGradient: qrOptions.cornersDotGradient as any,
          backgroundColor: qrOptions.backgroundColor,
          backgroundGradient: qrOptions.backgroundGradient as any,
          shape: qrOptions.shape,
          errorCorrectionLevel: qrOptions.errorCorrectionLevel,
          image: qrOptions.imagePath,
          imageSize: qrOptions.imageSize,
        },
        filePath,
      );
      return;
    }

    // Legacy fallback
    const { colorRange, icon, style } = job.data;
    return this.helperService.generateQrCode({
      colorRange: colorRange || ['#000000', '#000000'],
      content,
      filename,
      icon: icon || '',
      pathFile,
      style: (style as any) || 'classic',
    });
  }
}

@Processor('bulk-qr')
export class BulkQr {
  constructor(
    @InjectQueue('generate-qr')
    private readonly generateQrQueue: Queue<GenerateQrDTO>,
  ) {}

  @Process({ concurrency: 5 })
  async bulkQr(job: Job<GenerateBulkQr>) {
    const { couponsPath, generatePath, qrOptions } = job.data;
    // Legacy fields
    const colorRange = job.data.colorRange;
    const iconPath = job.data.iconPath;
    const style = job.data.style;

    const normalizePath = (p: string) => (p.startsWith('/') ? p.slice(1) : p);
    const couponsRoot = resolve(appRoot, normalizePath(couponsPath));
    const targetRoot = resolve(appRoot, normalizePath(generatePath));

    await fs.promises.mkdir(targetRoot, { recursive: true });

    const entries = await fs.promises.readdir(couponsRoot);
    const csvFiles = entries.filter((entry) =>
      entry.toLowerCase().endsWith('.csv'),
    );

    // Pre-count total lines for progress tracking
    let totalLines = 0;
    for (const csvFile of csvFiles) {
      const csvPath = resolve(couponsRoot, csvFile);
      const content = await fs.promises.readFile(csvPath, 'utf8');
      totalLines += content
        .split(/\r?\n/)
        .filter((l) => l.trim() && l.trim().toLowerCase() !== 'coupon').length;
    }

    const parentJobId = `bulk-qr-${job.id}`;
    job.progress({
      type: 'register-parent',
      parentJobId,
      total: totalLines,
      jobType: 'generate-qr',
      queue: 'bulk-qr',
      label: `QR ${couponsPath.split('/').filter(Boolean).pop() || 'bulk'}`,
    });

    let totalQueued = 0;
    for (const csvFile of csvFiles) {
      const csvPath = resolve(couponsRoot, csvFile);
      const targetDir = resolve(targetRoot, csvFile.replace(/\.csv$/i, ''));
      await fs.promises.mkdir(targetDir, { recursive: true });

      const reader = createInterface({
        input: createReadStream(csvPath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });

      const jobsBuffer: { data: GenerateQrDTO }[] = [];
      for await (const rawLine of reader) {
        const line = rawLine.trim();
        if (!line || line.toLowerCase() === 'coupon') {
          continue;
        }

        const jobData: GenerateQrDTO = {
          content: line,
          filename: line,
          pathFile: targetDir,
          parentJobId,
        };

        // New styling options take precedence
        if (qrOptions) {
          jobData.qrOptions = qrOptions;
        } else {
          // Legacy
          jobData.colorRange = colorRange;
          jobData.icon = iconPath;
          jobData.style = style;
        }

        jobsBuffer.push({ data: jobData });
        if (jobsBuffer.length >= QR_QUEUE_BATCH_SIZE) {
          await this.generateQrQueue.addBulk(jobsBuffer);
          totalQueued += jobsBuffer.length;
          jobsBuffer.length = 0;
        }
      }

      if (jobsBuffer.length) {
        await this.generateQrQueue.addBulk(jobsBuffer);
        totalQueued += jobsBuffer.length;
        jobsBuffer.length = 0;
      }
    }

    console.log(
      'bulk-qr summary',
      JSON.stringify({ files: csvFiles.length, totalQueued, parentJobId }),
    );
  }
}

@Processor('merge-image')
export class MergeImage {
  constructor(private helperService: HelperService) {}

  @Process({ concurrency: 3 })
  async mergeImage(job: Job<PostProcessQrDTO>) {
    try {
      const options = job.data;
      if (
        !fs.existsSync(
          resolve(
            appRoot,
            (options.pathSave?.startsWith('/')
              ? options.pathSave.slice(1)
              : options.pathSave) || '',
            options.filename || '',
          ),
        )
      ) {
        const result = await this.helperService.mergeImage(options);
        generated++;
        console.log('generated post process qr', generated);
        return result;
      }
    } catch (error) {
      throw new Error(error);
    }
  }
}

@Processor('post-process-qr')
export class PostProcessQr {
  constructor(
    @InjectQueue('merge-image')
    private mergeImageQueue: Queue<PostProcessQrDTO>,
  ) {}
  @Process({ concurrency: 1 })
  async postProccessQr(job: Job<PostProcessQrPerFileDTO>) {
    const { backgroundPath, qrPath, qrTargetPath, overlayImage, text } =
      job.data;
    const normalizePath = (p: string) => (p.startsWith('/') ? p.slice(1) : p);
    const qrImagePath = resolve(appRoot, normalizePath(qrPath));
    const qrTargetBase = resolve(appRoot, normalizePath(qrTargetPath));

    await fs.promises.mkdir(qrTargetBase, { recursive: true });

    // Collect .png files — supports both flat folders and nested subdirectories
    const imageEntries: { file: string; relDir: string }[] = [];
    const topEntries = await fs.promises.readdir(qrImagePath, {
      withFileTypes: true,
    });
    for (const entry of topEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        imageEntries.push({ file: entry.name, relDir: '' });
      } else if (entry.isDirectory()) {
        const subDir = resolve(qrImagePath, entry.name);
        const subEntries = await fs.promises.readdir(subDir);
        for (const sub of subEntries) {
          if (sub.toLowerCase().endsWith('.png')) {
            imageEntries.push({ file: sub, relDir: entry.name });
          }
        }
      }
    }

    console.log(
      `post-process-qr: found ${imageEntries.length} PNG files in ${qrImagePath}`,
    );

    if (imageEntries.length === 0) {
      console.warn('post-process-qr: no PNG files found, nothing to process');
      return;
    }

    // Register parent job for progress tracking
    const parentJobId = `post-process-${job.id}`;
    job.progress({
      type: 'register-parent',
      parentJobId,
      total: imageEntries.length,
      jobType: 'post-process',
      queue: 'post-process-qr',
      label: `Post-Process ${
        qrPath.split('/').filter(Boolean).pop() || 'merge'
      }`,
    });

    const jobsBuffer: {
      data: PostProcessQrDTO & { parentJobId?: string };
      opts: { removeOnComplete: boolean };
    }[] = [];
    let totalQueued = 0;
    for (const { file, relDir } of imageEntries) {
      const filename = file.replace(/\.png$/i, '');
      // Build the overlay source path (relative from project root)
      const overlaySourcePath = relDir
        ? `/${qrPath}/${relDir}/${file}`
        : `/${qrPath}/${file}`;
      // Build target save path — mirror subdirectory structure
      const targetSavePath = relDir
        ? `${qrTargetPath}/${relDir}`
        : qrTargetPath;
      // Ensure subdirectory target exists
      if (relDir) {
        await fs.promises.mkdir(
          resolve(appRoot, normalizePath(targetSavePath)),
          { recursive: true },
        );
      }
      jobsBuffer.push({
        data: {
          baseImage: {
            path: backgroundPath,
          },
          filename: `${filename}.png`,
          overlayImage: {
            path: overlaySourcePath,
            x: overlayImage.x,
            y: overlayImage.y,
            height: overlayImage.height,
            width: overlayImage.width,
            topRadius: overlayImage.topRadius,
          },
          pathSave: targetSavePath,
          text: {
            color: text.color,
            fontFamily: text.fontFamily,
            size: text.size,
            value: filename,
            x: text.x,
            y: text.y,
          },
          parentJobId,
        },
        opts: { removeOnComplete: true },
      });

      if (jobsBuffer.length >= MERGE_QUEUE_BATCH_SIZE) {
        await this.mergeImageQueue.addBulk(jobsBuffer);
        totalQueued += jobsBuffer.length;
        jobsBuffer.length = 0;
      }
    }

    if (jobsBuffer.length) {
      await this.mergeImageQueue.addBulk(jobsBuffer);
      totalQueued += jobsBuffer.length;
      jobsBuffer.length = 0;
    }

    console.log(
      'post-process-qr summary',
      JSON.stringify({ images: imageEntries.length, totalQueued, parentJobId }),
    );
  }
}

@Processor('bulk-post-qr')
export class BulkPostQr {
  constructor(private helperService: HelperService) {}

  @Process()
  async bulkPostQr(): Promise<void> {
    return;
  }
}
