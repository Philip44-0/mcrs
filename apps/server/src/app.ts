import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/_core/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });

  return app;
}