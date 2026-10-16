import type { ServerModule } from '@mcrs/core-server';

const module: ServerModule = {
  register: (ctx) => {
    ctx.events.on('demo.ping.sent', (payload) => ctx.log.info('got a ping', payload));
    ctx.hooks.guard('demo.ping.sending', () => { throw new Error('bug in a guard'); }, { priority: 1 });
  },
  start: async (ctx) => {
    ctx.events.emit('demo.ping.sent', { n: 1 });
    ctx.log.info('emitted, this line comes first');
    try { await ctx.hooks.runGuards('demo.ping.sending', {}); }
    catch (error) { ctx.log.error(String(error)); }
  },
};
export default module;