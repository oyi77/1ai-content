process.on('exit', (c) => { if (c) console.error('EXIT CODE:', c); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT:', e.stack?.slice(0, 1000)); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('REJECT:', String(e)?.slice(0, 1000)); process.exit(1); });

import('./src/index.ts').catch((e) => {
  console.error('IMPORT ERR:', e.stack?.slice(0, 1000));
  process.exit(1);
});
