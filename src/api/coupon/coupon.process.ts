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
import {Process, Processor} from '@nestjs/bull';
import {Job} from 'bull';
let idx = 0
import * as moment from "moment"

@Processor('coupon')
export class CouponProcess {
    private couponModels: DBModel
    constructor(
        private readonly couponDbService: CouponDbService
    ) {
        this.couponModels = this.couponDbService.getModels()
    }

    _randomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    _randomElem(arr: string) {
        return arr[this._randomInt(0, arr.length - 1)];
    }

    _generateOne2(charset: string, postfix: string, prefix: string, length: number) {
        let code = ""
        let typeChar = 3
        let firstChar = ""
        // type 0-> num, 1-> char
        let type = 0
        while ((length - prefix.length) > 0) {
            let char = this._randomElem(charset)
            // if (typeChar != typeCharTemp) {
            const charIsExist = code.includes(char)
            if (!charIsExist) {
                // typeChar = typeCharTemp
                // const checkChar = char.search(/.*([a-zA-Z]).*/)
                // if (((type == 0 && checkChar < 0) || (type == 1 && checkChar >= 0)) && !charIsExist) {
                code += char
                length--
                //     type = type == 0 ? 1 : 0
                // }
            }
            // }
            // const typeCharTemp = char.search(/.*([a-zA-Z]).*/) < 0 ? 0 : 1
            // if (firstChar === "" && typeCharTemp === firstTypeChar) {
            //     firstChar = char
            // } else {
            // }
        }
        return prefix + code + postfix;

    }

    _checkCodeV4(code: string, codeBfr: string, codeAftr: string) {
        const codeFirst = code.substring(1, 3)
        const codeLast = code.substring(5, 7)
        const codeBfrFirst = codeBfr.substring(0, 2)
        const codeBfrLast = codeBfr.substring(5, 7)
        const codeAftrFirst = codeAftr.substring(0, 2)
        const codeAftrLast = codeAftr.substring(5, 7)
        if (codeFirst[0] === (codeBfrFirst?.[0] || "") && codeLast[0] === (codeBfrLast?.[0] || "")) {
            const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
            const codeBfrLastIdx = alphanumericArr.indexOf(codeBfrLast[1])
            const checkIdxLast = codeLastIdx - codeBfrLastIdx
            if ((codeFirst[1] === (codeBfrFirst?.[1] || "")) && (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10) {
                const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1])
                const codeBfrFirstIdx = alphanumericArr.indexOf(codeBfrFirst[1])
                const checkIdx = codeFirstIdx - codeBfrFirstIdx
                if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
                    return false
                }
            }
        }
        if (codeFirst[0] === (codeAftrFirst?.[0] || "") && codeLast[0] === (codeAftrLast?.[0] || "")) {
            const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
            const codeAftrLastIdx = alphanumericArr.indexOf(codeAftrLast[1])
            const checkIdxLast = codeLastIdx - codeAftrLastIdx
            if ((codeFirst[1] === (codeAftrFirst?.[1] || "")) && (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10) {
                const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1])
                const codeAftrFirstIdx = alphanumericArr.indexOf(codeAftrFirst[1])
                const checkIdx = codeFirstIdx - codeAftrFirstIdx
                if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
                    return false
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
        return true

    }

    @Process()
    async generateCoupon(job: Job<generateCouponDTO>) {
        const config = job.data
        let codes: any = {};
        const count = config.count
        let validCode = 0
        while (validCode === 0) {
            while (config.count > 0) {
                let code = this._generateOne2(config.char, config.postfix, config.prefix, config.lengths);
                // let code = `${config.prefix}${code1.substring(3, 8)}`
                // const firstCode = code.substring(3, 5)
                // const scndCode = code.substring(3, 7)
                // if ((scnd[scndCode] || 0) < 6) {
                // const checkCode = checkCodeSort(Object.keys(codes), code)
                // console.log(checkCode)
                const isNumeric = code.replace(config.prefix, "").replace(config.postfix, "").search(/.*([0-9]).*/) < 0 ? false : true
                const isAlpha = code.replace(config.prefix, "").replace(config.postfix, "").search(/.*([a-zA-Z]).*/) < 0 ? false : true
                const alphanumCheck = config.type === "alpha" ? isAlpha : config.type === "numeric" ? isNumeric : (isNumeric && isAlpha)
                const checkCode = await this.couponModels.Coupons.Coupons.findOne({coupon: code})
                if (!checkCode && codes[code] === undefined && alphanumCheck) {
                    // first[firstCode] ? first[firstCode] += 1 : first[firstCode] = 1
                    // scnd[scndCode] ? scnd[scndCode] += 1 : scnd[scndCode] = 1
                    // firstTypeChar = firstTypeChar == 0 ? 1 : 0
                    config.count--;
                    codes[code] = true
                    // await models.coupon.create({coupon: code}).then(() => {
                    //     config.count--;
                    //     codes[code] = true
                    console.log("code generate", count - config.count, code, firstTypeChar)
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
            const sortedCode = Object.keys(codes)
            let countLoop = 0
            while (countLoop < sortedCode.length) {
                const code = sortedCode[countLoop]
                const codeBfr = sortedCode[countLoop - 1]
                const codeAftr = sortedCode[countLoop + 1]
                const checkCode = this._checkCodeV4(code || "", codeBfr || "", codeAftr || "")
                if (!checkCode) {
                    delete codes[code]
                    config.count++
                }
                countLoop++
            }
            // }
            console.log(count - config.count, config.count)
            // process.exit()
            if (config.count < 1) {
                validCode = 1
            }
        }
        const arrCode = Object.keys(codes)
        let lastIdx = 0
        const counInsert = 100000
        for (let index = 0; index < arrCode.length / counInsert; index++) {
            console.log("insert loop->", index + 1)
            const sliceArr: {coupon: string, project: string}[] = arrCode.slice(lastIdx, (counInsert + lastIdx)).map(v => {return {coupon: v, project: config.project}})
            const sliceArrCoupon: string[] = arrCode.slice(lastIdx, (counInsert + lastIdx)).map(v => {return v})
            await this.couponModels.Coupons.Coupons.insertMany(sliceArr)
            await this._writeCsv(sliceArrCoupon, config.project, config.prefix, config.postfix)
            lastIdx += counInsert
        }
        return true
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

@Processor("coupon2")
export class CouponProcess2 {
    private couponModels: DBModel
    constructor(
        private readonly couponDbService: CouponDbService
    ) {
        this.couponModels = this.couponDbService.getModels()
    }

    _randomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    _randomElem(arr: string) {
        return arr[this._randomInt(0, arr.length - 1)];
    }


    _generateOne(charset: string, postfix: string, prefix: string, length: number) {
        let code = ""
        let typeChar = 3
        let firstChar = ""
        let type = 0
        while ((length - prefix.length) > 0) {
            let char = this._randomElem(charset)
            const charIsExist = code.includes(char)
            if (!charIsExist) {
                code += char
                length--
            }
        }
        return prefix + code + postfix;

    }

    _checkCodeV4(code: string, codeBfr: string, codeAftr: string) {
        const codeFirst = code.substring(1, 3)
        const codeLast = code.substring(5, 7)
        const codeBfrFirst = codeBfr.substring(0, 2)
        const codeBfrLast = codeBfr.substring(5, 7)
        const codeAftrFirst = codeAftr.substring(0, 2)
        const codeAftrLast = codeAftr.substring(5, 7)
        if (codeFirst[0] === (codeBfrFirst?.[0] || "") && codeLast[0] === (codeBfrLast?.[0] || "")) {
            const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
            const codeBfrLastIdx = alphanumericArr.indexOf(codeBfrLast[1])
            const checkIdxLast = codeLastIdx - codeBfrLastIdx
            if ((codeFirst[1] === (codeBfrFirst?.[1] || "")) && (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10) {
                const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1])
                const codeBfrFirstIdx = alphanumericArr.indexOf(codeBfrFirst[1])
                const checkIdx = codeFirstIdx - codeBfrFirstIdx
                if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
                    return false
                }
            }
        }
        if (codeFirst[0] === (codeAftrFirst?.[0] || "") && codeLast[0] === (codeAftrLast?.[0] || "")) {
            const codeLastIdx = alphanumericArr.indexOf(codeLast[1])
            const codeAftrLastIdx = alphanumericArr.indexOf(codeAftrLast[1])
            const checkIdxLast = codeLastIdx - codeAftrLastIdx
            if ((codeFirst[1] === (codeAftrFirst?.[1] || "")) && (checkIdxLast < 0 ? checkIdxLast * -1 : checkIdxLast) < 10) {
                const codeFirstIdx = alphanumericArr.indexOf(codeFirst[1])
                const codeAftrFirstIdx = alphanumericArr.indexOf(codeAftrFirst[1])
                const checkIdx = codeFirstIdx - codeAftrFirstIdx
                if ((checkIdx < 0 ? checkIdx * -1 : checkIdx) < 10) {
                    return false
                }
            }
        }
        return true
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

    @Process()
    async generateCoupon(job: Job<generateCouponDTO>) {
        let {lengths, count, project, type, char, postfix, prefix} = job.data
        const limitRowPerLoop = 100000
        const totalLoop = Math.ceil(count / limitRowPerLoop)
        let totalLoopIdx = 0
        let codeGenerated = 0
        const startDate = moment().format("YYYY-MM-DD YYYY-MM-DD HH:mm:ss")
        while (totalLoopIdx < totalLoop) {
            let validCode = 0
            let codes: any = {}
            let countCoupon = totalLoopIdx + 1 < totalLoop ? limitRowPerLoop : count % limitRowPerLoop
            while (countCoupon > 0) {
                let code = this._generateOne(char, postfix, prefix, lengths);
                const isNumeric = code.replace(prefix, "").replace(postfix, "").search(/.*([0-9]).*/) < 0 ? false : true
                const isAlpha = code.replace(prefix, "").replace(postfix, "").search(/.*([a-zA-Z]).*/) < 0 ? false : true
                const alphanumCheck = type === "alpha" ? isAlpha : type === "numeric" ? isNumeric : (isNumeric && isAlpha)
                const checkCode = await this.couponModels.Coupons.Coupons.findOne({coupon: code})
                if (!checkCode && codes[code] === undefined && alphanumCheck) {
                    countCoupon--;
                    codeGenerated++
                    codes[code] = true
                    console.log("code generate", ` || totalLoop = ${totalLoop} `, ` || loop ${totalLoopIdx + 1}`, ` || totalGenerate ${codeGenerated}`, code, ` || TOTAL TIME = ${moment(startDate, "YYYY-MM-DD HH:mm:ss").fromNow()}`)
                }
            }


            const sortedCode = Object.keys(codes).sort()
            let countLoop = 0
            while (countLoop < sortedCode.length) {
                const code = sortedCode[countLoop]
                const codeBfr = sortedCode[countLoop - 1]
                const codeAftr = sortedCode[countLoop + 1]
                const checkCode = this._checkCodeV4(code || "", codeBfr || "", codeAftr || "")
                if (!checkCode) {
                    delete codes[code]
                    codeGenerated--
                    countCoupon++
                }
                codeGenerated--
                countLoop++
            }
            if (countCoupon < 1) {
                validCode = 1
            }


            const arrCode = Object.keys(codes)
            let lastIdx = 0
            const counInsert = 100000
            for (let index = 0; index < arrCode.length / counInsert; index++) {
                console.log("insert loop->", index + 1)
                const sliceArr: {coupon: string, project: string}[] = arrCode.slice(lastIdx, (counInsert + lastIdx)).map(v => {return {coupon: v, project}})
                const sliceArrCoupon: string[] = arrCode.slice(lastIdx, (counInsert + lastIdx)).map(v => {return v})
                await this.couponModels.Coupons.Coupons.insertMany(sliceArr)
                await this._writeCsv(sliceArrCoupon, project, prefix, postfix)
                lastIdx += counInsert
            }
            totalLoopIdx++
        }

    }
}
