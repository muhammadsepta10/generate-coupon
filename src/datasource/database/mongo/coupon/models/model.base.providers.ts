import { Connection } from 'mongoose';
import { CouponsSchema } from './coupon.entity';

export const baseModelProviders = [
  {
    provide: 'COUPONS_MODEL',
    useFactory: (connection: Connection) => {
      return {
        Coupons: connection.model('Coupons', CouponsSchema),
      };
    },
    inject: ['DATABASE_CONNECTION'],
  },
];
