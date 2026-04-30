import { Connection } from 'mongoose';
import { CouponsSchema } from './coupon.entity';
import { DownloadLinkSchema } from './download-link.entity';

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
  {
    provide: 'DOWNLOAD_LINK_MODEL',
    useFactory: (connection: Connection) => {
      return connection.model('DownloadLink', DownloadLinkSchema);
    },
    inject: ['DATABASE_CONNECTION'],
  },
];
