import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Android va iOS ilovalari uchun CORS sozlamalarini to'liq sozlaymiz
  app.enableCors({
    origin: [
      'https://localhost',       // Android (https scheme)
      'http://localhost',        // Android (http scheme)
      'capacitor://localhost',  // iOS
      'http://localhost:5173', 
      'http://localhost:5174', 
      'https://voice.erkaboyev.uz',
      'https://admin.voice.erkaboyev.uz'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  });

  app.setGlobalPrefix('api');

  app.useStaticAssets(join(process.cwd(), 'storage', 'records'), {
    prefix: '/uploads',
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('ComunoActive API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Proxy settings
  app.use('/admin', createProxyMiddleware({
    target: 'http://localhost:5174',
    changeOrigin: true,
  }));

  app.use('/', (req: any, res: any, next: any) => {
    const isApi = req.path.startsWith('/api');
    const isDocs = req.path.startsWith('/docs');
    const isSocket = req.path.startsWith('/socket.io');
    const isUploads = req.path.startsWith('/uploads');
    if (isApi || isDocs || isSocket || isUploads) return next();
    return createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
    })(req, res, next);
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
