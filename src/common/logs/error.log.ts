import * as winston from 'winston';
import transports from "./transports.log"

export default winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: "DD-MM-YYYY HH:mm:ss",
        }),
        winston.format.json()
    ),
    transports: process.env.NODE_ENV == "development" ? [transports.console] : [transports.error]
})
