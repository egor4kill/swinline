import { catalog } from './core.js?v=5';

/**
 * Адаптер Upgrader-а к сайту: все операции идут через Supabase RPC.
 * Инвентарь и исход броска хранит сервер (upgrader_profiles/upgrader_upgrade).
 */
export class SiteAdapter {
  constructor(rpc) {
    this.rpc = rpc;
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
