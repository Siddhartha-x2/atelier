import { readConfig } from './config.js';
import { createApp } from './app.js';

const config = readConfig();
const { app, db } = createApp(config);
const server = app.listen(config.port, config.host, () => {
  console.log(`Art Studio: ${config.appOrigin}`);
});
server.on('error', error => { console.error(error.message); db.close(); process.exitCode = 1; });
function stop() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
