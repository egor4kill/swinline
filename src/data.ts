export type Ev = {
  id: string
  cat: number
  categoryKey?: string
  league: string
  title: string
  team1?: string
  team2?: string
  score?: string
  isLive?: boolean
  liveTime?: string
  desc: string
  out: [string, number][]
  extraMarkets?: { title: string; out: [string, number][] }[]
}

export type UserAccount = {
  id: string
  username: string
  email?: string
  password?: string
  role: 'user' | 'admin'
  avatar: string
  title: string
  bal: number
  bets: any[]
  log: any[]
  createdAt: number
  isBlocked?: boolean
  stats: {
    totalBets: number
    wonBets: number
    lostBets: number
    totalProfit: number
  }
  achievements: string[]
}

export type PlatformAuditLog = {
  id: string
  time: number
  actor: string
  action: string
  type: 'auth' | 'bet' | 'admin' | 'game'
}

export const DEFAULT_ACCOUNTS: UserAccount[] = []


export const CATS = [
  'Свинские соревнования',
  'Интернет и мемы',
  'Жизнь SVINLINE',
  'Абсолютный абсурд',
  'Кибер-Хряк (Esports)',
  'Скоростное поедание',
  'Хрюк-MMA',
  'Свинобол РПЛ'
]

export const SPORT_CATEGORIES = [
  { id: 0, name: 'Свин-Лига РПЛ', count: 154, icon: 'Trophy' },
  { id: 5, name: 'Скоростное поедание', count: 27, icon: 'Utensils' },
  { id: 4, name: 'Кибер-Хряк (CS & Dota)', count: 77, icon: 'Gamepad2' },
  { id: 1, name: 'Интернет и мемы', count: 26, icon: 'Flame' },
  { id: 2, name: 'Жизнь SVINLINE', count: 14, icon: 'Building' },
  { id: 3, name: 'Абсолютный абсурд', count: 42, icon: 'Sparkles' },
  { id: 6, name: 'Хрюк-MMA', count: 18, icon: 'Swords' },
  { id: 7, name: 'Свинобол 24/7', count: 31, icon: 'Activity' }
]

export const EVENTS: Ev[] = []


export const TOURNAMENT_PILLS = [
  { name: 'ТОП-СВИН', tag: 'Хит', color: 'orange' },
  { name: 'PGL BUCHAREST 2027', tag: 'CS2', color: 'red' },
  { name: 'СВИН-ЛИГА РПЛ', tag: 'Футбол', color: 'blue' },
  { name: 'THUNDERPIG CUP', tag: 'Dota 2', color: 'purple' },
  { name: 'BURGER CHAMPIONS', tag: 'Фуд', color: 'yellow' },
  { name: 'ХРЮК-MMA 300', tag: 'Бои', color: 'emerald' }
]

export const PROMOS = [
  [
    'БОНУС 0 ₽ — ЗАТО СВИНЬЯ ДОВОЛЬНА',
    'Эксклюзивный приветственный бонус SVINLINE. Начисляется моментально каждому новому игроку без депозита и условий по отыгрышу.'
  ],
  [
    'ХРЮКЭШБЭК 0%',
    'Гарантированная программа лояльности SVINLINE. Максимальная честность и прозрачность расчетов для каждого пользователя платформы.'
  ],
  [
    'VIP-ХРЯК: СТАТУС ПРЕМИУМ',
    'Персональный менеджер-маскот, доступ в закрытую ложу и высший приоритет в поддержке.'
  ],
  [
    'БЕЗОПАСНЫЙ СВИНОБЕТ',
    'Играйте исключительно на платформенную валюту SV₽. Максимальный контроль банкролла, моментальные выплаты и чистый азарт.'
  ]
]

export const NEWS = [
  [
    'Свинья назначена Верховным Директором по Эмоциям',
    'Совет директоров единогласно утвердил стратегию развития бренда и новые стандарты заботы о клиентах.'
  ],
  [
    'SVINLINE открыла тренировочную базу для киберспорта',
    'Игроки тренируются по 14 часов в день, готовясь к осеннему сезону ThunderPig World Championship.'
  ],
  [
    'Коэффициент 1.01 признан самым надежным исходом года',
    'Независимые аналитики подтвердили: консервативные стратегии продолжают удерживать лидерство.'
  ]
]

export const ABOUT = [
  'История создания',
  'SVINLINE — передовая цифровая платформа спортивных и киберспортивных событий. Мы создали премиальный сервис с высокими коэффициентами, глубокой аналитикой и уникальной линейкой турниров.',
  'Наша философия',
  '100% эмоций, передовые технологии и бескомпромиссный спортивный драйв. Платформа нового поколения с мгновенным расчетом ставок в валюте SV₽.',
  'Руководство компании',
  'Генеральный директор SVINLINE лично курирует стандарты надежности платформы, расчет линии и развитие турниров.'
]

export const START = 10000
export const MINBET = 10
