import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpErrorFilter } from './common/http-error.filter';
export function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGINS').split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Kiosk-Key'],
    credentials: false,
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Primax V6 API')
      .setVersion('1.0.0')
      .setDescription(
        'Backend común. Pagos DEMO confirmados por terminal. Dinero en cadenas decimales PEN. Listas de historial: page=1, limit=20 (máximo 100). JWT para socios; x-kiosk-key para terminales. No incluir la clave de terminal en aplicaciones públicas.',
      )
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-kiosk-key' }, 'kiosk')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: false },
  });
}
