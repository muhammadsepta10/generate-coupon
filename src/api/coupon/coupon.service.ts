import { BadRequestException, Injectable } from "@nestjs/common";
import { CouponDbService } from "@database/database/mongo/coupon/coupon-db.service";
import { DBModel } from "@database/database/mongo/coupon/interfaces/model.interface";
import {
  compareCsvAndQrDTO,
  GenerateBulkQr,
  generateCouponDTO,
  postProcessImageBulkDTO,
  PostProcessQrPerFileDTO,
  SplitCsvAndQrDTO,
} from "./coupon.dto";
import * as archiver from "archiver";
import * as lodash from "lodash";

let firstTypeChar = 0;
let alphanumericArr = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
import * as fs from "fs";
import * as appRootPath from "app-root-path";
import { Queue } from "bull";
import { InjectQueue } from "@nestjs/bull";
import { join, resolve } from "path";
let idx = 0;
import * as moment from "moment";

@Injectable()
export class CouponService {
  private couponModels: DBModel;
  constructor(
    @InjectQueue("coupon") private couponQueue: Queue,
    @InjectQueue("coupon2") private couponQueue2: Queue<generateCouponDTO>,
    @InjectQueue("bulk-qr") private bulkQrQueue: Queue<GenerateBulkQr>,
    @InjectQueue("post-process-qr")
    private postProcessQrQueue: Queue<PostProcessQrPerFileDTO>,
    private readonly couponDbService: CouponDbService,
  ) {
    this.couponModels = this.couponDbService.getModels();
  }

  async generateBulkQr(param: GenerateBulkQr) {
    this.bulkQrQueue.add(param);
  }

  async generateCoupon(config: generateCouponDTO) {
    await this.couponQueue2.add(config, { attempts: 10, backoff: 10 });
  }

  downloadPerItem(project: string, filename: string) {
    project = project.toUpperCase();
    const filePath = `${appRootPath}/public/coupons/csv/${project}/${filename}`;
    return filePath;
  }

  async splitCsvAndQr(param: SplitCsvAndQrDTO) {
    const {
      numberOfSplit: numberOfSplits,
      pathCsvToSplit,
      pathQrToSplit,
      targetSplit,
    } = param;
    const basePath = resolve(`${appRootPath}/../`);
    const csvPath = resolve(`${basePath}${pathCsvToSplit}`);
    const csvFilename = csvPath.split("/")[csvPath.split("/").length - 1];
    const qrPath = resolve(`${basePath}${pathQrToSplit}`);
    const qrFilename = qrPath.split("/")[csvPath.split("/").length - 1];
    const targetPath = resolve(`${basePath}${targetSplit}`);
    const totalSplit = numberOfSplits.reduce((a, b) => a + b);
    if (!fs.existsSync(csvPath) || !fs.existsSync(qrPath)) {
      throw new BadRequestException("csv or qr path not found");
    }
    let csvFile = fs
      .readFileSync(csvPath, { encoding: "utf8" })
      .split("\r\n")
      .filter((v) => v && v.toLowerCase() !== "coupon");
    let qrFiles = fs.readdirSync(qrPath);
    if (csvFile.length !== totalSplit) {
      throw new BadRequestException("Number Of split and csv length not same");
    }
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    let csvSplit = [];
    let qrSplit = [];
    for (let index = 0; index < numberOfSplits.length; index++) {
      csvSplit.push([]);
      qrSplit.push([]);
      let numberOfSplit = numberOfSplits[index];
      const qrTarget = resolve(`${targetPath}/${qrFilename}(${numberOfSplit})`);
      const csvTarget = resolve(
        `${targetPath}/${csvFilename.replace(
          ".csv",
          "",
        )}(${numberOfSplit}).csv`,
      );
      if (!fs.existsSync(qrTarget)) {
        fs.mkdirSync(qrTarget, { recursive: true });
      }
      while (numberOfSplit > 0) {
        const coupon = csvFile[0];
        console.log("coupon", coupon);
        const existQr = qrFiles.indexOf(`${coupon}.png`);
        if (existQr < 0) {
          throw new BadRequestException("QrNotFound");
        }
        const qr = resolve(`${qrPath}/${coupon}.png`);
        fs.copyFileSync(qr, resolve(`${qrTarget}/${coupon}.png`));
        qrSplit[index].push(qr);
        qrFiles.splice(existQr, 1);
        csvFile.shift();
        csvSplit[index].push(coupon);
        numberOfSplit--;
      }
      const coupons = ["coupon", ...csvSplit[index]].join("\r\n");
      fs.writeFileSync(`${csvTarget}`, Buffer.from(coupons), {
        encoding: "utf8",
      });
    }
  }

  async checkCsvAndQr(param: compareCsvAndQrDTO) {
    let { csvFilePath, qrFilePath } = param;
    const basePath = `${appRootPath}/..`;
    csvFilePath = resolve(`${basePath}/${csvFilePath}`);
    qrFilePath = resolve(`${basePath}/${qrFilePath}`);
    const csvFile = fs
      .readFileSync(csvFilePath, { encoding: "utf8" })
      .split("\r\n")
      .filter((v) => v && v.toLowerCase() !== "coupon")
      .map((v) => `${v}.png`);
    const qrFiles = fs.readdirSync(qrFilePath);
    if (csvFile.length !== qrFiles.length) {
      throw new BadRequestException("Jumlah tidak sama");
    }
    const compare = lodash.difference(
      lodash.sortBy(csvFile),
      lodash.sortBy(qrFiles),
    );
    console.log("compare", compare);
  }

  async postProcessQrPerFile(param: PostProcessQrPerFileDTO) {
    await this.postProcessQrQueue.add(param);
  }

  async postProcessImageBulk(param: postProcessImageBulkDTO) {
    const { projectPath } = param;
    const projectFullPath = resolve(`${appRootPath}/../${projectPath}`);
    const batchFiles = fs
      .readdirSync(projectFullPath)
      .filter((v) => v.search(".DS_Store") < 0);
    for (let index = 0; index < batchFiles.length; index++) {
      const qrFilesPath = resolve(`${projectFullPath}/${batchFiles[index]}/qr`);
      const qrTargetPath = `${projectPath}${batchFiles[index]}/post-process`;
      const backgroundPath = `${projectPath}${batchFiles[index]}/background.png`;
      const jobData: { data: PostProcessQrPerFileDTO }[] = fs
        .readdirSync(qrFilesPath)
        .filter((v) => {
          return fs.lstatSync(resolve(`${qrFilesPath}/${v}`)).isDirectory();
        })
        .map((v) => {
          return {
            data: {
              qrPath: `${projectPath}${batchFiles[index]}/qr/${v}`,
              qrTargetPath: `${qrTargetPath}/${v}`,
              backgroundPath,
            },
          };
        });
      // console.log(jobData);
      await this.postProcessQrQueue.addBulk(jobData);
    }
  }

  async verificationQr(param: postProcessImageBulkDTO) {
    const { projectPath } = param;
    const basePath = `${appRootPath}/../`;
    const projectFullPath = resolve(`${basePath}${projectPath}`);
    const batchs = fs
      .readdirSync(projectFullPath)
      .filter(
        (v) =>
          v != ".DS_Store" &&
          fs.lstatSync(resolve(`${projectFullPath}/${v}`)).isDirectory(),
      )
      .map((v) => `${projectFullPath}/${v}`);
    let totalQr = 0;
    let totalCodes = 0;
    let totalFileQr = 0;
    let totalFolder = 0;
    let notSame = [];
    for (let index = 0; index < batchs.length; index++) {
      const batch = batchs[index];
      const batchDir = fs.readdirSync(batch);
      const csvFiles = lodash.sortBy(
        batchDir.filter((v) => {
          return v.split(".")[1] == "csv";
        }),
      );
      for (let csvFileIdx = 0; csvFileIdx < csvFiles.length; csvFileIdx++) {
        const csvFile = csvFiles[csvFileIdx];
        const csvFilePath = resolve(`${batch}/${csvFile}`);
        const codeFile = csvFile.split(".")[0];
        const qrFilePath = resolve(`${batch}/post-process/${codeFile}`);
        let qrFiles = [];
        let codes = [];
        try {
          qrFiles = lodash.sortBy(
            fs
              .readdirSync(qrFilePath)
              .filter((v) => v.split(".")[1] == "png")
              .map((v) => v.split(".")[0]),
          );
          totalFileQr += 1;
        } catch (error) {
          qrFiles = [];
        }
        try {
          codes = lodash.sortBy(
            fs
              .readFileSync(`${csvFilePath}`, { encoding: "utf8" })
              .split("\r\n")
              .slice(1),
          );
          totalFolder += 1;
        } catch (error) {
          codes = [];
        }
        totalQr += qrFiles.length;
        totalCodes += codes.length;
        const isSame = lodash.isEqual(qrFiles, codes);
        console.log("jumlah fileQr ==> ", qrFiles.length);
        console.log("jumlah code ==> ", codes.length);
        console.log(codeFile, "  ===>  ", isSame);
        if (!isSame) {
          notSame.push({
            code: codeFile,
            qrLength: qrFiles.length,
            codeLength: codes.length,
          });
        }
      }
    }
    console.log("=============SUMMARY==================");
    console.log("totalQr ==> ", totalQr);
    console.log("totalFileQr ==> ", totalFileQr);
    console.log("totalFolder ==> ", totalFolder);
    console.log("totalCode ==> ", totalCodes);
    console.log("notSame ==> ", notSame);
    console.log("======================================");
  }

  async downloadAll(project: string) {
    project = project.toUpperCase();
    const dirPath = `${appRootPath}/public/coupons/csv/${project}`;
    const zipFile = `${project}-${moment().format("YYYYMMDDHHmmss")}.zip`;
    const output = await fs.createWriteStream(`${dirPath}/${zipFile}`);
    const archive = await archiver.create("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });
    await archive.pipe(output);
    if (!fs.existsSync(dirPath)) {
      throw new BadRequestException("Invalid Project");
    }
    await fs
      .readdirSync(dirPath)
      .filter((v) => {
        const vSplited = v?.split(".") || [];
        return vSplited?.[vSplited.length - 1]?.toUpperCase() === "CSV";
      })
      .map((v) => {
        const csvFile = `${dirPath}/${v}`;
        archive.append(fs.createReadStream(csvFile), { name: v });
      });
    await archive.finalize();
    return `${dirPath}/${zipFile}`;
  }

  async listGeneratedCoupon(project: string) {
    project = project.toUpperCase();
    const dirPath = `${appRootPath}/public/coupons/csv/${project}`;
    const files = fs.readdirSync(dirPath).filter((v) => {
      const vSplited = v?.split(".") || [];
      return vSplited?.[vSplited.length - 1]?.toUpperCase() === "CSV";
    });
    return files;
  }

  _writeCsv(data: any[], project: string, prefix: string, postfix: string) {
    let originName =
      prefix !== "" ? prefix : postfix !== "" ? postfix : project;
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
    data.unshift("coupon");
    fs.writeFile(`${dirPath}/${name}.csv`, data.join("\r\n"), (err) => {
      if (err) {
        console.log("error create", err);
      } else {
        console.log("Success create");
      }
    });
    return true;
  }
}
