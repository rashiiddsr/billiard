import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Billiard POS API')
    .setDescription('Billiard Billing + Cafe POS + IoT System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
  console.log(`📚 Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
