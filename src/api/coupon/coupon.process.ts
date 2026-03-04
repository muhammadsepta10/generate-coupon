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
import appRootPath from 'app-root-path';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
let idx = 0;
import { format, formatDistanceToNowStrict } from 'date-fns';
import { resolve } from 'node:path';
import { HelperService } from '@common/helper/helper.service';
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

const DEFAULT_DB_CHUNK_SIZE = 5_000;
const DEFAULT_BULK_WRITE_CHUNK = 50_000;
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
    const dirPath = `${appRootPath}/../public/coupons/csv/${project}`;
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
  private readonly limitPerLoop = 1_000_000;
  private readonly generationChunkSize = 50_000;
  private readonly candidateOversampleFactor = 1.5;
  private readonly dbChunkSize = DEFAULT_DB_CHUNK_SIZE;
  private readonly bulkWriteChunk = DEFAULT_BULK_WRITE_CHUNK;
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

  private generateOneCode(
    charset: string,
    postfix: string,
    prefix: string,
    totalLength: number,
  ) {
    const resolvedCharset =
      charset && charset.length > 0 ? charset : alphanumericArr.join('');
    const availableLength = totalLength - prefix.length - postfix.length;
    if (availableLength <= 0) {
      throw new Error(
        'Invalid configuration: lengths must be greater than prefix + postfix length',
      );
    }
    let code = '';
    const seenChars = new Set<string>();
    const enforceUnique = resolvedCharset.length >= availableLength;

    while (code.length < availableLength) {
      const candidate = this._randomElem(resolvedCharset);
      if (enforceUnique && seenChars.has(candidate)) {
        continue;
      }
      code += candidate;
      if (enforceUnique) {
        seenChars.add(candidate);
      }
    }

    return `${prefix}${code}${postfix}`;
  }

  private _checkCodeV4(code: string, codeBfr: string, codeAftr: string) {
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
    return true;
  }

  private async writeCsv(
    codes: string[],
    project: string,
    prefix: string,
    postfix: string,
  ) {
    const originName =
      prefix !== '' ? prefix : postfix !== '' ? postfix : project;
    let fileName = originName;
    const dirPath = `${appRootPath}/../public/coupons/csv/${project}`;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    while (fs.existsSync(`${dirPath}/${fileName}.csv`)) {
      fileName = `${originName}-${idx}`;
      idx++;
    }
    const csvContent = ['coupon', ...codes].join('\r\n');
    await fs.promises.writeFile(`${dirPath}/${fileName}.csv`, csvContent, {
      encoding: 'utf8',
    });
    return `${dirPath}/${fileName}.csv`;
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

  private filterCodesByProximity(codes: string[]) {
    if (codes.length < 2) {
      return codes;
    }
    const sorted = [...codes].sort();
    const valid: string[] = [];
    for (let index = 0; index < sorted.length; index++) {
      const code = sorted[index];
      const codeBfr = sorted[index - 1] ?? '';
      const codeAftr = sorted[index + 1] ?? '';
      if (this._checkCodeV4(code, codeBfr, codeAftr)) {
        valid.push(code);
      }
    }
    return valid;
  }

  private async findExistingCoupons(codes: string[]) {
    if (codes.length === 0) {
      return new Set<string>();
    }
    const duplicates = new Set<string>();
    for (const chunk of chunkArray(codes, this.dbChunkSize)) {
      const rows = await this.couponModels.Coupons.Coupons.find(
        { coupon: { $in: chunk } },
        { coupon: 1, _id: 0 },
      ).lean();
      rows.forEach((row) => duplicates.add(row.coupon));
      if (duplicates.size === codes.length) {
        break;
      }
    }
    return duplicates;
  }

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
      const operations = chunk.map((coupon) => ({
        updateOne: {
          filter: { coupon },
          update: {
            $setOnInsert: {
              coupon,
              project,
            },
          },
          upsert: true,
        },
      }));

      const result = await this.couponModels.Coupons.Coupons.bulkWrite(
        operations,
        { ordered: false },
      );
      const upsertedIds = result.upsertedIds ?? {};
      const insertedIndexes = new Set<number>(
        Object.keys(upsertedIds).map((key) => Number(key)),
      );
      chunk.forEach((code, index) => {
        if (insertedIndexes.has(index)) {
          inserted.push(code);
          return;
        }
        duplicates.push(code);
      });
    }

    return { inserted, duplicates };
  }

  private generateCandidateSet(
    target: number,
    charset: string,
    postfix: string,
    prefix: string,
    totalLength: number,
    type: generateCouponDTO['type'],
    existing: Set<string>,
    blocked?: Set<string>,
  ) {
    const desiredSize = Math.max(
      target,
      Math.ceil(target * this.candidateOversampleFactor),
    );
    const candidates = new Set<string>();
    const maxAttempts = Math.max(desiredSize * 20, 1000);
    let attempts = 0;
    while (candidates.size < desiredSize && attempts < maxAttempts) {
      attempts++;
      const candidate = this.generateOneCode(
        charset,
        postfix,
        prefix,
        totalLength,
      );
      if (
        existing.has(candidate) ||
        blocked?.has(candidate) ||
        candidates.has(candidate)
      ) {
        continue;
      }
      if (!this.isCodeTypeValid(candidate, type, prefix, postfix)) {
        continue;
      }
      candidates.add(candidate);
    }
    if (candidates.size < target) {
      throw new Error(
        'Unable to generate the requested amount of unique coupon codes. Please adjust the configuration.',
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
    } = params;

    const inserted: string[] = [];
    const insertedSet = new Set<string>();
    const rejectedSet = new Set<string>();
    const rejectedQueue: string[] = [];
    const rejectedCacheLimit = 200_000;
    const rememberRejected = (code: string) => {
      if (!code || insertedSet.has(code) || rejectedSet.has(code)) {
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
      10_000,
    );
    let lastLoggedProgress = 0;

    while (inserted.length < target) {
      const remaining = target - inserted.length;
      const batchSize = Math.min(remaining, this.generationChunkSize);
      const candidates = this.generateCandidateSet(
        batchSize,
        charset,
        postfix,
        prefix,
        totalLength,
        type,
        insertedSet,
        rejectedSet,
      );
      const proximitySafe = this.filterCodesByProximity(candidates);
      const filteredCandidates: string[] = [];

      for (const candidateChunk of chunkArray(
        proximitySafe,
        this.dbChunkSize,
      )) {
        if (!candidateChunk.length) {
          continue;
        }
        const duplicatesInDb = await this.findExistingCoupons(candidateChunk);
        duplicatesInDb.forEach((code) => rememberRejected(code));
        const uniqueChunk = candidateChunk.filter(
          (code) => !duplicatesInDb.has(code),
        );
        filteredCandidates.push(...uniqueChunk);
        if (filteredCandidates.length >= batchSize) {
          break;
        }
      }

      const candidatesToInsert = filteredCandidates.slice(0, batchSize);
      if (!candidatesToInsert.length) {
        attemptsWithoutProgress++;
        continue;
      }

      const { inserted: newlyInserted, duplicates: duplicatesOnInsert } =
        await this.persistCoupons(candidatesToInsert, project);
      duplicatesOnInsert.forEach((code) => rememberRejected(code));

      if (newlyInserted.length === 0) {
        attemptsWithoutProgress++;
        if (attemptsWithoutProgress > 25) {
          throw new Error(
            'Generation stalled because too many duplicates already exist. Consider adjusting prefix, postfix, or charset.',
          );
        }
        continue;
      }

      attemptsWithoutProgress = 0;
      inserted.push(...newlyInserted);
      newlyInserted.forEach((code) => {
        insertedSet.add(code);
        rejectedSet.delete(code);
      });

      if (
        inserted.length - lastLoggedProgress >= progressInterval ||
        inserted.length >= target
      ) {
        lastLoggedProgress = inserted.length;
        console.log(
          'coupon generation progress',
          `loop ${loopIndex + 1}/${loopTotal}`,
          `inserted ${inserted.length}/${target}`,
          `last batch +${newlyInserted.length}`,
          `started ${startLabel}`,
          `elapsed ${formatDistanceToNowStrict(startTime)}`,
        );
      }
    }

    return inserted;
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

    const totalLoop = Math.ceil(count / this.limitPerLoop);
    let remaining = count;
    this.rng = new SeededRandom(deriveNumericSeed(job));
    for (let loopIndex = 0; loopIndex < totalLoop; loopIndex++) {
      const chunkTarget = Math.min(remaining, this.limitPerLoop);
      const inserted = await this.generateAndPersistBatch({
        target: chunkTarget,
        charset,
        postfix,
        prefix,
        totalLength: lengths,
        type,
        project,
        loopIndex,
        loopTotal: totalLoop,
      });
      remaining -= inserted.length;
      await this.writeCsv(inserted, project, prefix, postfix);
    }
    this.rng = null;
  }
}

@Processor('generate-qr')
export class GenerateQr {
  constructor(private helperService: HelperService) {}

  @Process({ concurrency: 512 })
  async generateQr(job: Job<GenerateQrDTO>) {
    const { colorRange, content, filename, icon, pathFile, style } = job.data;
    return this.helperService.generateQrCode({
      colorRange,
      content,
      filename,
      icon,
      pathFile,
      style,
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
    const { colorRange, couponsPath, generatePath, iconPath, style } = job.data;
    const basePath = resolve(`${appRoot}/../`);
    const couponsRoot = resolve(`${basePath}${couponsPath}`);
    const targetRoot = resolve(`${basePath}/${generatePath}`);

    await fs.promises.mkdir(targetRoot, { recursive: true });

    const entries = await fs.promises.readdir(couponsRoot);
    const csvFiles = entries.filter((entry) =>
      entry.toLowerCase().endsWith('.csv'),
    );

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
        jobsBuffer.push({
          data: {
            content: line,
            colorRange,
            filename: line,
            icon: iconPath,
            pathFile: targetDir,
            style,
          },
        });
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
      JSON.stringify({ files: csvFiles.length, totalQueued }),
    );
  }
}

@Processor('merge-image')
export class MergeImage {
  constructor(private helperService: HelperService) {}

  @Process({ concurrency: 50 })
  async mergeImage(job: Job<PostProcessQrDTO>) {
    try {
      const options = job.data;
      if (
        !fs.existsSync(
          resolve(`${appRoot}/../${options.pathSave}/${options.filename}`),
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
  @Process({ concurrency: 10 })
  async postProccessQr(job: Job<PostProcessQrPerFileDTO>) {
    const { backgroundPath, qrPath, qrTargetPath, overlayImage, text } =
      job.data;
    const basePath = resolve(`${appRoot}/..`);
    const qrImagePath = resolve(`${basePath}/${qrPath}`);
    const qrTargetBase = resolve(`${basePath}/${qrTargetPath}`);

    await fs.promises.mkdir(qrTargetBase, { recursive: true });

    const entries = await fs.promises.readdir(qrImagePath);
    const imageEntries = entries.filter((entry) =>
      entry.toLowerCase().endsWith('.png'),
    );

    const jobsBuffer: {
      data: PostProcessQrDTO;
      opts: { removeOnComplete: boolean };
    }[] = [];
    let totalQueued = 0;
    for (const entry of imageEntries) {
      const filename = entry.replace(/\.png$/i, '');
      jobsBuffer.push({
        data: {
          baseImage: {
            path: backgroundPath,
          },
          filename: `${filename}.png`,
          overlayImage: {
            path: `/${qrPath}/${entry}`,
            x: overlayImage.x,
            y: overlayImage.y,
            height: overlayImage.height,
            width: overlayImage.width,
            topRadius: overlayImage.topRadius,
          },
          pathSave: qrTargetPath,
          text: {
            color: text.color,
            fontFamily: text.fontFamily,
            size: text.size,
            value: filename,
            x: text.x,
            y: text.y,
          },
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
      JSON.stringify({ images: imageEntries.length, totalQueued }),
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
