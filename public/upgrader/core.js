import vanilla from './vanilla-catalog.js?v=7';
import economy from './economy-profile.js?v=7';

export const catalog = vanilla;
export function valueOf(id, items = catalog, chain = new Set()) {
  const item = items.find(i => i.id === id);
  if (!item || chain.has(id)) throw Error('Некорректный рецепт: ' + id);
  if (item.value !== undefined) return item.value;
  if (item.raw !== undefined) return item.raw;
  const next = new Set(chain).add(id);
  return Object.entries(item.recipe).reduce((sum, [part, n]) => sum + valueOf(part, items, next) * n, 0) / (item.output || 1);
}
export function chance(stake, reward) {
  if (!Number.isFinite(stake) || !Number.isFinite(reward) || stake <= 0 || reward <= 0) throw Error('Некорректная стоимость');
  // Честный расчет, но максимум 90%: даже если предмет дороже, всегда есть 10% риск потерять его
  return Math.min(economy.maxChance, stake / reward);
}
export function formatChance(probability) {
  const percent = probability * 100;
  return new Intl.NumberFormat('ru-RU', percent > 0 && percent < 0.1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 }).format(percent);
}
export const initialInventory = () => [
  { slot: 's1', id: 'iron_ingot', count: 48 },
  { slot: 's2', id: 'gold_ingot', count: 16 },
  { slot: 's3', id: 'diamond', count: 8 },
  { slot: 's4', id: 'emerald', count: 12 },
  { slot: 's5', id: 'iron_pickaxe', count: 1, durability: 0.56 },
  { slot: 's6', id: 'apple', count: 16 },
  { slot: 's7', id: 'ender_pearl', count: 4 },
  { slot: 's8', id: 'diamond_sword', count: 1 },
  { slot: 's9', id: 'golden_apple', count: 3 },
  { slot: 's10', id: 'oak_log', count: 64 },
  { slot: 's11', id: 'grass_block', count: 32 },
  { slot: 's12', id: 'netherite_ingot', count: 1 },
  { slot: 's13', id: 'ender_eye', count: 8 },
  { slot: 's14', id: 'amethyst_shard', count: 24 },
  { slot: 's15', id: 'redstone', count: 64 },
  { slot: 's16', id: 'lapis_lazuli', count: 32 },
  { slot: 's17', id: 'diamond_pickaxe', count: 1 },
  { slot: 's18', id: 'obsidian', count: 16 },
  { slot: 's19', id: 'experience_bottle', count: 16 },
  { slot: 's20', id: 'cooked_beef', count: 32 }
];
export function settle(state, request, roll) {
  const slot = state.inventory.find(i => i.slot === request.slot),
        item = catalog.find(i => i.id === request.target);
  if (!slot || !item || !Number.isFinite(roll) || roll < 0 || roll >= 1) throw Error('Предметы недоступны');
  const stakeCount = 1;
  const targetCount = 1;
  const odds = chance(valueOf(slot.id) * (slot.durability ?? 1), valueOf(item.id));
  const inventory = structuredClone(state.inventory);
  const source = inventory.find(i => i.slot === slot.slot);
  source.count -= 1;
  const won = roll < odds;
  if (won) {
    let dest = inventory.find(i => i.id === item.id && i.durability === undefined && i.count + 1 <= (item.max || 64));
    if (dest) dest.count += 1;
    else inventory.push({ slot: request.requestId, id: item.id, count: 1 });
  }
  const result = {
    id: request.requestId,
    won,
    roll,
    chance: odds,
    stake: slot.id,
    stakeCount: 1,
    target: item.id,
    targetCount: 1,
    at: new Date().toISOString()
  };
  return {
    inventory: inventory.filter(i => i.count > 0),
    history: [result, ...state.history].slice(0, 20),
    result
  };
}
