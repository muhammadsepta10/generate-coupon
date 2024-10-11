import { HttpAdapterHost, NestApplication, NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as express from "express";
import { Queue } from "bull";
import * as expressWinston from "express-winston";
import * as winston from "winston";
import { AllExceptionsFilter } from "@common/filter/exception.filter";
import transports from "@common/logs/transports.log";
import { AppConfigService } from "@common/config/app-config/app-config.service";
import { BullMonitorExpress } from "@bull-monitor/express";
import { BullAdapter } from "@bull-monitor/root/dist/bull-adapter";

async function bootstrap() {
  const app: NestApplication = await NestFactory.create(AppModule);
  const configService = app.get(AppConfigService);
  const port = configService.PORT;
  let adapters: BullAdapter[] = [];
  let queues = [
    "coupon",
    "coupon2",
    "bulk-qr",
    "generate-qr",
    "post-process-qr",
    "merge-image",
  ];
  for (let index = 0; index < queues.length; index++) {
    const queue = queues[index];
    const adapter = new BullAdapter(app.get<Queue>(`BullQueue_${queue}`));
    adapters.push(adapter);
  }

  const monitor = new BullMonitorExpress({
    queues: adapters,
    gqlIntrospection: true,
    metrics: {
      collectInterval: { seconds: 1 },
      maxMetrics: 100,
    },
  });
  await monitor.init();

  app.use(`/admin/queues`, monitor.router);

  const config = new DocumentBuilder()
    .addSecurity("authentication", {
      name: "authentication",
      type: "apiKey",
      in: "header",
    })
    .setTitle("MINI ENGINE API")
    .setVersion("1.0")
    .addTag("MINI ENGINE")
    .setContact("REDBOX", "https://redboxdigital.id/", "redbox@missiidea.com")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);
  app.enableCors();
  // app.use(helmet())
  app.use(express.json({ limit: 50000000 }));
  app.use(
    expressWinston.logger({
      format: winston.format.combine(
        winston.format.timestamp({
          format: "DD-MM-YYYY HH:mm:ss",
        }),
        winston.format.json(),
      ),
      meta: true,
      responseWhitelist: [...expressWinston.responseWhitelist, "body"],
      requestWhitelist: [
        "body",
        "query",
        "params",
        "method",
        "originalUrl",
        "headers.x-forwarded-for",
        "connection.remoteAddress",
      ],
      transports:
        process.env.NODE_ENV == "development"
          ? [transports.console]
          : [transports.combine],
    }),
  );
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
  await app.listen(port).then((v) => {
    console.log("RUNNING ON PORT ", port);
  });
}
bootstrap();
