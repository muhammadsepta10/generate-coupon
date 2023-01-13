import {Injectable} from '@nestjs/common';
import {CouponDbService} from "@database/database/mongo/coupon/coupon-db.service"
import {DBModel} from "@database/database/mongo/coupon/interfaces/model.interface"
import {generateCouponDTO} from './coupon.dto';
let firstTypeChar = 0
let alphanumericArr = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
import * as fs from "fs"
import appRootPath from "app-root-path"
import {Queue} from 'bull';
import {InjectQueue} from '@nestjs/bull';
let idx = 0

@Injectable()
export class CouponService {
    private couponModels: DBModel
    constructor(
        @InjectQueue("coupon") private couponQueue: Queue,
        @InjectQueue("coupon2") private couponQueue2: Queue<generateCouponDTO>,
        private readonly couponDbService: CouponDbService
    ) {
        this.couponModels = this.couponDbService.getModels()
    }

    async generateCoupon(config: generateCouponDTO) {
        await this.couponQueue2.add(config, {attempts: 10, backoff: 10})
    }

    _writeCsv(data: any[], project: string, prefix: string, postfix: string) {
        let originName = prefix !== "" ? prefix : postfix !== "" ? postfix : project
        let name = originName
        const dirPath = `${appRootPath}/../public/coupons/csv/${project}`
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, {recursive: true})
        }
        while (fs.existsSync(`${dirPath}/${name}.csv`)) {
            name = originName
            name = `${name}-${idx}`
            idx++
        }
        data.unshift("coupon")
        fs.writeFile(`${dirPath}/${name}.csv`, data.join("\r\n"), (err) => {
            if (err) {
                console.log("error create", err)
            } else {
                console.log("Success create")
            }
        })
        return true
    }
}
