import {CouponDbConfigService} from "../../../../common/config/database-config/coupon-db-config/coupon-db-config.service"
import {createConnection} from 'mongoose';
export const databaseProviders = [
    {
        provide: "DATABASE_CONNECTION",
        inject: [CouponDbConfigService],
        useFactory: async (config: CouponDbConfigService) =>
            await createConnection(config.URL)
    },
];