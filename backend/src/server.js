import app from './app.js';
import config from './config/index.js';
import prisma from './lib/prisma.js';

const server = app.listen(config.port, () => {
  console.log(`\n🟢 WhatsApp AI Agent backend running on http://localhost:${config.port}`);
  console.log(`   OpenAI:   ${config.openai.enabled ? 'enabled (' + config.openai.model + ')' : 'disabled → rule-based fallback'}`);
  console.log(`   WhatsApp: ${config.whatsapp.enabled ? 'Cloud API enabled' : 'disabled → simulator mode'}`);
  console.log(`   Webhook:  POST http://localhost:${config.port}/api/whatsapp/webhook`);
  console.log(`   Simulate: POST http://localhost:${config.port}/api/whatsapp/simulate\n`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
