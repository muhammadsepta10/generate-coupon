import { BadRequestException, Injectable } from '@nestjs/common';
import { CouponDbService } from '@database/database/mongo/coupon/coupon-db.service';
import { DBModel } from '@database/database/mongo/coupon/interfaces/model.interface';
import {
  compareCsvAndQrDTO,
  GenerateBulkQr,
  generateCouponDTO,
  postProcessImageBulkDTO,
  PostProcessQrDTO,
  PostProcessQrPerFileDTO,
  SplitCsvAndQrDTO,
  QrPreviewDTO,
  ListQrOutputDTO,
  DownloadQrDTO,
  DownloadPostProcessDTO,
  overLayImageDTO,
  TextDTO,
} from './coupon.dto';
import * as archiver from 'archiver';
import * as lodash from 'lodash';
import * as fs from 'node:fs';
import * as appRootPath from 'app-root-path';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { basename, join, resolve } from 'node:path';
import { HelperService } from '@common/helper/helper.service';

const projectRoot = appRootPath.path || appRootPath.toString();
let csvFileNameCounter = 0;

@Injectable()
export class CouponService {
  private readonly couponsBasePath = join(
    projectRoot,
    'public',
    'coupons',
    'csv',
  );
  private readonly qrBasePath = join(projectRoot, 'public', 'coupons', 'qr');
  private readonly postProcessBasePath = join(
    projectRoot,
    'public',
    'coupons',
    'post-process',
  );
  private couponModels: DBModel;
  constructor(
    @InjectQueue('coupon') private couponQueue: Queue,
    @InjectQueue('coupon2') private couponQueue2: Queue<generateCouponDTO>,
    @InjectQueue('bulk-qr') private bulkQrQueue: Queue<GenerateBulkQr>,
    @InjectQueue('post-process-qr')
    private postProcessQrQueue: Queue<PostProcessQrPerFileDTO>,
    @InjectQueue('merge-image')
    private mergeImageQrQueue: Queue<PostProcessQrDTO>,
    private readonly couponDbService: CouponDbService,
    private readonly helperService: HelperService,
  ) {
    this.couponModels = this.couponDbService.getModels();
  }

  private resolveAbsolutePath(target: string) {
    if (!target) {
      throw new BadRequestException('Path is required');
    }
    const baseRoot = appRootPath.path || appRootPath.toString();
    const normalized = target.startsWith('/') ? target.slice(1) : target;
    return resolve(baseRoot, normalized);
  }

  private async ensureZipFile(
    sourceDir: string,
    filter: (name: string) => boolean,
    zipName: string,
  ) {
    if (!fs.existsSync(sourceDir)) {
      throw new BadRequestException('Source directory not found');
    }
    const zipPath = join(sourceDir, zipName);
    if (fs.existsSync(zipPath)) {
      return zipPath;
    }
    const archive = archiver.create('zip', { zlib: { level: 9 } });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const output = fs.createWriteStream(zipPath);
      output.on('close', () => resolvePromise());
      output.on('error', (err) => rejectPromise(err));
      archive.on('error', (err) => rejectPromise(err));
      archive.pipe(output);
      fs.readdirSync(sourceDir)
        .filter((entry) => filter(entry))
        .forEach((entry) => {
          const fullPath = join(sourceDir, entry);
          if (fs.lstatSync(fullPath).isDirectory()) {
            archive.directory(fullPath, entry);
          } else {
            archive.file(fullPath, { name: entry });
          }
        });
      archive.finalize().catch((err) => rejectPromise(err));
    });
    return zipPath;
  }

  private sanitizeName(input: string) {
    return input.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  private ensureDirectory(path: string) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }
  }

  private listDirectories(path: string) {
    if (!fs.existsSync(path)) {
      return [] as string[];
    }
    return fs
      .readdirSync(path)
      .filter((entry) => fs.lstatSync(join(path, entry)).isDirectory())
      .sort((a, b) => a.localeCompare(b));
  }

  private listCsvBasenames(path: string) {
    if (!fs.existsSync(path)) {
      return [] as string[];
    }
    return fs
      .readdirSync(path)
      .filter((entry) => entry.toLowerCase().endsWith('.csv'))
      .map((entry) => entry.replace(/\.csv$/i, ''))
      .sort((a, b) => a.localeCompare(b));
  }

  private toPublicPath(base: 'csv' | 'qr' | 'post', project: string) {
    switch (base) {
      case 'csv':
        return `/public/coupons/csv/${project}`;
      case 'qr':
        return `/public/coupons/qr/${project}`;
      case 'post':
      default:
        return `/public/coupons/post-process/${project}`;
    }
  }

  private normalizeOverlay(
    overlay: PostProcessQrDTO['overlayImage'],
  ): PostProcessQrDTO['overlayImage'];
  private normalizeOverlay(overlay: overLayImageDTO): overLayImageDTO;
  private normalizeOverlay(overlay: any) {
    const normalized = {
      ...overlay,
      x: Number(overlay.x ?? 0),
      y: Number(overlay.y ?? 0),
      width:
        overlay.width !== undefined ? Number(overlay.width) : overlay.width,
      height:
        overlay.height !== undefined ? Number(overlay.height) : overlay.height,
      topRadius:
        overlay.topRadius !== undefined
          ? Number(overlay.topRadius)
          : overlay.topRadius,
    };
    if (!normalized.path) {
      delete normalized.path;
    }
    return normalized;
  }

  private normalizeText(
    text: PostProcessQrDTO['text'],
  ): PostProcessQrDTO['text'];
  private normalizeText(text: TextDTO): TextDTO;
  private normalizeText(text: any) {
    return {
      ...text,
      value: text.value ?? '',
      size: Number(text.size ?? 0),
      x: Number(text.x ?? 0),
      y: Number(text.y ?? 0),
    };
  }

  async generateBulkQr(param: GenerateBulkQr) {
    const job = await this.bulkQrQueue.add(param);
    return { jobId: job.id };
  }

  async generateCoupon(config: generateCouponDTO) {
    await this.couponQueue2.add(config, { attempts: 10, backoff: 10 });
  }

  downloadPerItem(project: string, filename: string) {
    project = project.toUpperCase();
    return join(this.couponsBasePath, project, filename);
  }

  async splitCsvAndQr(param: SplitCsvAndQrDTO) {
    const {
      numberOfSplit: numberOfSplits,
      pathCsvToSplit,
      pathQrToSplit,
      targetSplit,
    } = param;
    const csvPath = this.resolveAbsolutePath(pathCsvToSplit);
    const qrPath = this.resolveAbsolutePath(pathQrToSplit);
    const targetPath = this.resolveAbsolutePath(targetSplit);
    const csvFilename = basename(csvPath);
    const qrFilename = basename(qrPath);
    const totalSplit = numberOfSplits.reduce((a, b) => a + b);
    if (!fs.existsSync(csvPath) || !fs.existsSync(qrPath)) {
      throw new BadRequestException('csv or qr path not found');
    }
    const csvLines = fs
      .readFileSync(csvPath, { encoding: 'utf8' })
      .split('\r\n')
      .filter((v) => v && v.toLowerCase() !== 'coupon');
    const qrFiles = fs.readdirSync(qrPath);
    if (csvLines.length !== totalSplit) {
      throw new BadRequestException('Number Of split and csv length not same');
    }
    this.ensureDirectory(targetPath);
    const csvSplit: string[][] = [];
    const qrSplit: string[][] = [];
    for (let index = 0; index < numberOfSplits.length; index++) {
      csvSplit.push([]);
      qrSplit.push([]);
      let numberOfSplit = numberOfSplits[index];
      const qrTarget = join(targetPath, `${qrFilename}(${numberOfSplit})`);
      const csvTarget = join(
        targetPath,
        `${csvFilename.replace('.csv', '')}(${numberOfSplit}).csv`,
      );
      this.ensureDirectory(qrTarget);
      while (numberOfSplit > 0) {
        const coupon = csvLines.shift();
        if (!coupon) {
          break;
        }
        const existQr = qrFiles.indexOf(`${coupon}.png`);
        if (existQr < 0) {
          throw new BadRequestException('QrNotFound');
        }
        const qrFilePath = join(qrPath, `${coupon}.png`);
        fs.copyFileSync(qrFilePath, join(qrTarget, `${coupon}.png`));
        qrSplit[index].push(qrFilePath);
        qrFiles.splice(existQr, 1);
        csvSplit[index].push(coupon);
        numberOfSplit--;
      }
      const coupons = ['coupon', ...csvSplit[index]].join('\r\n');
      fs.writeFileSync(csvTarget, Buffer.from(coupons), {
        encoding: 'utf8',
      });
    }
  }

  async checkCsvAndQr(param: compareCsvAndQrDTO) {
    let { csvFilePath, qrFilePath } = param;
    csvFilePath = this.resolveAbsolutePath(csvFilePath);
    qrFilePath = this.resolveAbsolutePath(qrFilePath);
    const csvFile = fs
      .readFileSync(csvFilePath, { encoding: 'utf8' })
      .split('\r\n')
      .filter((v) => v && v.toLowerCase() !== 'coupon')
      .map((v) => `${v}.png`);
    const qrFiles = fs.readdirSync(qrFilePath);
    if (csvFile.length !== qrFiles.length) {
      throw new BadRequestException('Jumlah tidak sama');
    }
    const compare = lodash.difference(
      lodash.sortBy(csvFile),
      lodash.sortBy(qrFiles),
    );
    return { difference: compare };
  }

  async postProcessQrPerFile(param: PostProcessQrDTO) {
    const job = await this.mergeImageQrQueue.add({
      ...param,
      overlayImage: this.normalizeOverlay(param.overlayImage),
      text: this.normalizeText(param.text),
    });
    const result = await job.finished();
    return result;
  }

  async postProcessImageBulk(param: postProcessImageBulkDTO) {
    const { projectPath } = param;
    const overlayImage = this.normalizeOverlay(param.overlayImage);
    const text = this.normalizeText(param.text);
    const projectFullPath = this.resolveAbsolutePath(projectPath);
    const batchFiles = fs
      .readdirSync(projectFullPath)
      .filter((v) => v.search('.DS_Store') < 0);
    for (let index = 0; index < batchFiles.length; index++) {
      const batchName = batchFiles[index];
      const qrFilesPath = join(projectFullPath, batchName, 'qr');
      const qrTargetPath = `${projectPath}${batchName}/post-process`;
      const backgroundPath = `${projectPath}${batchName}/background.png`;
      const jobData: { data: PostProcessQrPerFileDTO }[] = fs
        .readdirSync(qrFilesPath)
        .filter((v) => {
          return fs.lstatSync(join(qrFilesPath, v)).isDirectory();
        })
        .map((v) => {
          return {
            data: {
              qrPath: `${projectPath}${batchName}/qr/${v}`,
              qrTargetPath: `${qrTargetPath}/${v}`,
              backgroundPath,
              overlayImage,
              text,
            },
          };
        });
      // console.log(jobData);
      await this.postProcessQrQueue.addBulk(jobData);
    }
  }

  async verificationQr(param: postProcessImageBulkDTO) {
    const { projectPath } = param;
    const projectFullPath = this.resolveAbsolutePath(projectPath);
    const batchs = fs
      .readdirSync(projectFullPath)
      .filter(
        (v) =>
          v != '.DS_Store' &&
          fs.lstatSync(join(projectFullPath, v)).isDirectory(),
      )
      .map((v) => join(projectFullPath, v));
    let totalQr = 0;
    let totalCodes = 0;
    let totalFileQr = 0;
    let totalFolder = 0;
    const notSame = [];
    for (let index = 0; index < batchs.length; index++) {
      const batch = batchs[index];
      const batchDir = fs.readdirSync(batch);
      const csvFiles = lodash.sortBy(
        batchDir.filter((v) => {
          return v.split('.')[1] == 'csv';
        }),
      );
      for (let csvFileIdx = 0; csvFileIdx < csvFiles.length; csvFileIdx++) {
        const csvFile = csvFiles[csvFileIdx];
        const csvFilePath = join(batch, csvFile);
        const codeFile = csvFile.split('.')[0];
        const qrFilePath = join(batch, 'post-process', codeFile);
        let qrFiles = [];
        let codes = [];
        try {
          qrFiles = lodash.sortBy(
            fs
              .readdirSync(qrFilePath)
              .filter((v) => v.split('.')[1] == 'png')
              .map((v) => v.split('.')[0]),
          );
          totalFileQr += 1;
        } catch (error) {
          qrFiles = [];
        }
        try {
          codes = lodash.sortBy(
            fs
              .readFileSync(`${csvFilePath}`, { encoding: 'utf8' })
              .split('\r\n')
              .slice(1),
          );
          totalFolder += 1;
        } catch (error) {
          codes = [];
        }
        totalQr += qrFiles.length;
        totalCodes += codes.length;
        const isSame = lodash.isEqual(qrFiles, codes);
        console.log('jumlah fileQr ==> ', qrFiles.length);
        console.log('jumlah code ==> ', codes.length);
        console.log(codeFile, '  ===>  ', isSame);
        if (!isSame) {
          notSame.push({
            code: codeFile,
            qrLength: qrFiles.length,
            codeLength: codes.length,
          });
        }
      }
    }
    console.log('=============SUMMARY==================');
    console.log('totalQr ==> ', totalQr);
    console.log('totalFileQr ==> ', totalFileQr);
    console.log('totalFolder ==> ', totalFolder);
    console.log('totalCode ==> ', totalCodes);
    console.log('notSame ==> ', notSame);
    console.log('======================================');
  }

  async downloadAll(project: string) {
    project = project.toUpperCase();
    const dirPath = join(this.couponsBasePath, project);
    if (!fs.existsSync(dirPath)) {
      throw new BadRequestException('Invalid Project');
    }
    const zipFile = await this.ensureZipFile(
      dirPath,
      (entry) => entry.toLowerCase().endsWith('.csv'),
      `${project}.zip`,
    );
    return zipFile;
  }

  async listGeneratedCoupon(project: string) {
    project = project.toUpperCase();
    const dirPath = join(this.couponsBasePath, project);
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath).filter((v) => {
      const vSplited = v?.split('.') || [];
      return vSplited?.[vSplited.length - 1]?.toUpperCase() === 'CSV';
    });
    return files;
  }

  async generateQrPreviewImage(param: QrPreviewDTO) {
    const rawRange = Array.isArray(param.colorRange) ? param.colorRange : [];
    if (rawRange.length < 2) {
      throw new BadRequestException('colorRange must contain two colors');
    }
    const colorRange: [string, string] = [
      rawRange[0].trim(),
      rawRange[1].trim(),
    ];
    const dataUrl = await this.helperService.generateQrPreview({
      content: param.content,
      style: param.style,
      colorRange: [colorRange[0], colorRange[1]],
      icon: param.iconPath,
    });
    return { dataUrl };
  }

  async previewMergeImage(param: PostProcessQrDTO) {
    const dataUrl = await this.helperService.mergeImagePreview({
      baseImage: param.baseImage,
      overlayImage: this.normalizeOverlay(param.overlayImage),
      text: this.normalizeText(param.text),
    });
    return { dataUrl };
  }

  async queuePostProcessFolder(param: PostProcessQrPerFileDTO) {
    await this.postProcessQrQueue.add({
      ...param,
      overlayImage: this.normalizeOverlay(param.overlayImage),
      text: this.normalizeText(param.text),
    });
    return { status: 'queued' };
  }

  async listGeneratedQrOutputs(param: ListQrOutputDTO) {
    const absPath = this.resolveAbsolutePath(param.generatePath);
    if (!fs.existsSync(absPath)) {
      return { directories: [], files: [] };
    }
    const directories: string[] = [];
    const files: string[] = [];
    fs.readdirSync(absPath).forEach((entry) => {
      const stat = fs.lstatSync(join(absPath, entry));
      if (stat.isDirectory()) {
        directories.push(entry);
      } else {
        files.push(entry);
      }
    });
    return { directories, files };
  }

  async downloadGeneratedQr(param: DownloadQrDTO) {
    const absPath = this.resolveAbsolutePath(param.generatePath);
    const baseName = this.sanitizeName(
      param.zipName ? param.zipName.replace(/\.zip$/i, '') : basename(absPath),
    );
    const zipFile = await this.ensureZipFile(
      absPath,
      (entry) => entry !== `${baseName}.zip`,
      `${baseName}.zip`,
    );
    return zipFile;
  }

  async downloadPostProcess(param: DownloadPostProcessDTO) {
    let targetPath = param.path ? this.resolveAbsolutePath(param.path) : null;
    if (!targetPath) {
      if (!param.project) {
        throw new BadRequestException('project or path is required');
      }
      targetPath = resolve(`${this.postProcessBasePath}/${param.project}`);
    }
    if (!fs.existsSync(targetPath)) {
      throw new BadRequestException('Post process directory not found');
    }
    const baseName = this.sanitizeName(
      param.zipName
        ? param.zipName.replace(/\.zip$/i, '')
        : basename(targetPath),
    );
    const zipFile = await this.ensureZipFile(
      targetPath,
      (entry) => entry !== `${baseName}.zip`,
      `${baseName}.zip`,
    );
    return zipFile;
  }

  getProjectOverview() {
    this.ensureDirectory(this.couponsBasePath);
    this.ensureDirectory(this.qrBasePath);
    this.ensureDirectory(this.postProcessBasePath);

    const couponProjects = this.listDirectories(this.couponsBasePath);
    const qrProjects = this.listDirectories(this.qrBasePath);
    const postProjects = this.listDirectories(this.postProcessBasePath);

    const projectSet = new Set<string>([
      ...couponProjects,
      ...qrProjects,
      ...postProjects,
    ]);

    const overview = Array.from(projectSet)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const couponPath = couponProjects.includes(name)
          ? join(this.couponsBasePath, name)
          : null;
        const qrPath = qrProjects.includes(name)
          ? join(this.qrBasePath, name)
          : null;
        const postPath = postProjects.includes(name)
          ? join(this.postProcessBasePath, name)
          : null;

        const csvFiles = couponPath ? this.listCsvBasenames(couponPath) : [];
        const qrFolders = qrPath ? this.listDirectories(qrPath) : [];
        const postFolders = postPath ? this.listDirectories(postPath) : [];

        const pendingQr = csvFiles.filter((file) => !qrFolders.includes(file));
        const pendingPostProcess = qrFolders.filter(
          (folder) => !postFolders.includes(folder),
        );

        return {
          name,
          hasCoupon: couponPath !== null,
          hasQr: qrPath !== null,
          hasPostProcess: postPath !== null,
          couponPath: couponPath ? this.toPublicPath('csv', name) : null,
          qrPath: qrPath ? this.toPublicPath('qr', name) : null,
          postProcessPath: postPath ? this.toPublicPath('post', name) : null,
          csvFiles,
          qrFolders,
          postProcessFolders: postFolders,
          pendingQr,
          pendingPostProcess,
          pendingQrCount: pendingQr.length,
          pendingPostProcessCount: pendingPostProcess.length,
        };
      });

    const couponsWithoutQr = overview
      .filter((project) => project.pendingQrCount > 0)
      .map((project) => ({
        name: project.name,
        couponPath: project.couponPath,
        qrPath: project.qrPath || this.toPublicPath('qr', project.name),
        pendingCsv: project.pendingQr,
        pendingCount: project.pendingQrCount,
      }));

    const qrWithoutPostProcess = overview
      .filter((project) => project.pendingPostProcessCount > 0)
      .map((project) => ({
        name: project.name,
        qrPath: project.qrPath || this.toPublicPath('qr', project.name),
        postProcessPath:
          project.postProcessPath || this.toPublicPath('post', project.name),
        pendingFolders: project.pendingPostProcess,
        pendingCount: project.pendingPostProcessCount,
      }));

    const history = {
      coupons: couponProjects.map((name) => ({
        name,
        couponPath: this.toPublicPath('csv', name),
      })),
      qr: qrProjects.map((name) => ({
        name,
        qrPath: this.toPublicPath('qr', name),
      })),
      postProcess: postProjects.map((name) => ({
        name,
        postProcessPath: this.toPublicPath('post', name),
      })),
    };

    return {
      overview,
      couponsWithoutQr,
      qrWithoutPostProcess,
      history,
    };
  }

  _writeCsv(data: any[], project: string, prefix: string, postfix: string) {
    const originName =
      prefix !== '' ? prefix : postfix !== '' ? postfix : project;
    let name = originName;
    const dirPath = join(this.couponsBasePath, project);
    this.ensureDirectory(dirPath);
    while (fs.existsSync(`${dirPath}/${name}.csv`)) {
      name = originName;
      name = `${name}-${csvFileNameCounter}`;
      csvFileNameCounter++;
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
