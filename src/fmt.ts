// Общее форматирование суммы (перенесено из App.tsx дословно)
export const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' SV₽'
