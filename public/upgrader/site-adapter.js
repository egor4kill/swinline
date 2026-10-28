import { catalog } from './core.js?v=6';

/**
 * Адаптер Upgrader-а к сайту: операции идут через Supabase RPC.
 * Поддерживает Supabase Realtime для моментального появления новых открытых предметов.
 */
export class SiteAdapter {
  constructor(rpc, client) {
    this.rpc = rpc;
    this.client = client;
    this.channel = null;
  }

  async bootstrap() {
    const { data, error } = await this.rpc('upgrader_state', {});
    if (error) throw new Error(error.message || 'Не удалось загрузить инвентарь');
    if (!data) throw new Error('Сервер не вернул инвентарь');
    return {
      catalog,
      discovered: Array.isArray(data.discovered) ? data.discovered : [],
      inventory: Array.isArray(data.inventory) ? data.inventory : [],
      history: Array.isArray(data.history) ? data.history : [],
      mode: 'server',
    };
  }

  subscribeDiscovery(onItemDiscovered) {
    if (!this.client || typeof this.client.channel !== 'function') return () => {};
    try {
      this.channel = this.client
        .channel('realtime:server_discovered_items')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'server_discovered_items' },
          payload => {
            if (payload?.new?.id) {
              onItemDiscovered(payload.new.id, payload.new.discovered_by);
            }
          }
        )
        .subscribe();
      return () => {
        if (this.channel) {
          try { this.client.removeChannel(this.channel); } catch {}
          this.channel = null;
        }
      };
    } catch {
      return () => {};
    }
  }

  async upgrade(request) {
    const { data, error } = await this.rpc('upgrader_upgrade', {
      p_slot: request.slot,
      p_stake_count: 1,
      p_target: request.target,
      p_target_count: 1,
      p_request_id: request.requestId,
    });
    if (error) throw new Error(error.message || 'Сервер не подтвердил операцию');
    if (!data) throw new Error('Сервер не вернул результат');
    return data;
  }

  async reset() {
    const { data, error } = await this.rpc('upgrader_reset', {});
    if (error) throw new Error(error.message || 'Не удалось сбросить инвентарь');
    return data;
  }
}
