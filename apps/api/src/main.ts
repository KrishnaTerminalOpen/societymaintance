import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Prefix all API routes with /api/v1
  app.setGlobalPrefix('api/v1');
  
  // Enable CORS for frontend web application
  app.enableCors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  console.info(`🚀 ColonyDeposit API service running on http://localhost:${port}/api/v1`);
}

bootstrap();

