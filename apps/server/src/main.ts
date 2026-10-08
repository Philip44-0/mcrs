import { createApp } from './app.js';

const raw = process.env.PORT ?? '3000';
const port = Number.parseInt(raw, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT: "${raw}"`);
  process.exit(1);
}

createApp().listen(port, (error?: Error) => {
  if (error) {
    console.error(`Cannot listen on port ${port}:`, error.message);
    process.exit(1);
  }
  console.log(`MCRS server listening on http://localhost:${port}`);
});
