import { HelperService } from "@common/helper/helper.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  constructor(
    private helperService: HelperService,
    private commonService: HelperService,
  ) {}
  async getHello(res) {
    try {
      const generate = await this.helperService.mergeImage({
        baseImage: {
          path:
            "/deka_wafer/documents/Kode Unik Deka Wafer/1. Deka Jumbo 14G-5poin(1.000.000)/background.png",
        },
        filename: "test.png",
        overlayImage: {
          path:
            "/deka_wafer/documents/Kode Unik Deka Wafer/1. Deka Jumbo 14G-5poin(1.000.000)/qr/DEKA-WAFER_1OKTOBER2024-10/3A4DWRK.png",
          x: 85,
          y: 85,
          height: 180,
          width: 180,
          topRadius: 0,
        },
        pathSave: "/deka_wafer/test",
        text: {
          color: "white",
          fontFamily: "Arial",
          size: 20,
          value: "3A4DWRK",
          x: 165,
          y: 305,
        },
      });
      res.sendFile(generate);
    } catch (error) {
      console.log("err", error);
      res.send({ error: error });
    }
  }
}
