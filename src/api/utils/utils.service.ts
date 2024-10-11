import {Injectable} from '@nestjs/common';
import axios from "axios"
import * as fs from "fs"
import * as moment from 'moment';

@Injectable()
export class UtilsService {
    constructor() {

    }
    private _makeid(length) {
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() *
                charactersLength));
        }
        return result;
    }

    async bruteApi() {
        // SIKATOP#KodeUnik#Nama#No. Ktp#No. Hp#Kota
        const coupons = JSON.parse(fs.readFileSync("./coupons.json", {encoding: "utf8"}))
        const senders = ["6285967025385", "6285967025381", "6285967025382", "6285967025383", "6285967025384", "6285967025386", "6285967025387", "6285967025388", "6285967025389", "6285967025380", "6285967025390", "6285967025391", "6285967025392", "6285967025393", "6285967025394", "6285967025395", "6285967025396", "6285967025397", "6285967025398", "6285967025399"]
        const identities = ["3522061009980001", "3522061009980002", "3522061009980003", "3522061009980004", "3522061009980005", "3522061009980006", "3522061009980007", "3522061009980008", "3522061009980009", "3522061009980000", "3522061009980010", "3522061009980011", "3522061009980012", "3522061009980013", "3522061009980014", "3522061009980015", "3522061009980016", "3522061009980017", "3522061009980018", "3522061009980019"]
        let idx = 0
        for (let index = 0; index < coupons.length; index++) {
            const coupon = coupons[index].code
            const sender = senders[idx]
            const identity = identities[idx]
            const message = Buffer.from(`SIKATOP#${coupon}#${this._makeid(10)}#${identity}#${sender}#jakarta`).toString("base64")
            axios.post("http://192.168.1.228:5001/api/v1/validasi", {
                message,
                sender,
                media: "300",
                rcvdTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                "session_id": message,
                "job": "S09OVFJBS1RPUg=="
            }).then(v => console.log("resp", v.data)).catch(err => console.log("err", err))
            idx < 19 ? idx++ : idx = 0
        }
    }
}
