import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export const configureHttpSecurity = (app: NestExpressApplication): void => {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
        objectSrc: ["'none'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    frameguard: { action: 'deny' },
    noSniff: true
  }));
  const allowedOrigins = new Set(
    (process.env.PDS_CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed by PDS_CORS_ORIGINS'), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    credentials: false,
    maxAge: 600
  });
  app.useBodyParser('json', { limit: '256kb' });
};
