import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';

// Use require here to avoid TS build failures before dependency installation
// in restricted CI environments; runtime dependency is declared in package.json.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // BUG FIX #2b: Tambahkan compression untuk respons API lebih cepat
  // Ini sangat membantu di Hostinger yang bandwidthnya terbatas
  app.use(compression());

  app.enableCors({
    // BUG FIX #2c: Support multiple origin (localhost + production)
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim());

      // Izinkan jika tidak ada origin (request dari server/curl) atau ada di whitelist
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} tidak diizinkan`));
      }
    },
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.setGlobalPrefix('api/v1');

  // Swagger (nonaktifkan di production untuk performa)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Billiard POS API')
      .setDescription('Billiard Billing + Cafe POS + IoT System')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API running on port ${port}`);
}

bootstrap();
