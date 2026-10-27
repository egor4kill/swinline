import { useEffect } from 'react'

const VIEWS = ['line', 'live', 'esports', 'games24', 'wallet', 'promos', 'results', 'about', 'minecraft']

// Хэш-глубокие ссылки: #/games/crash, #/wallet, #/esports …
// — адресом можно делиться, кнопка «назад» ходит по разделам.
// Состояние не трогаем: только синхронизация view/gamesTab с location.hash.
export function useHashNav(
  view: string,
  setView: (v: string) => void,
  gamesTab: string,
  setGamesTab: (t: any) => void
) {
  // хэш → состояние (первая загрузка + кнопки назад/вперёд)
  useEffect(() => {
    const apply = () => {
      const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
      let v = parts[0]
      if (v === 'games') v = 'games24' // короткий алиас
      if (!v || !VIEWS.includes(v)) return
      setView(v)
      if (v === 'games24' && parts[1]) setGamesTab(parts[1])
    }
    apply()
    const onNav = () => apply()
    window.addEventListener('popstate', onNav)
    window.addEventListener('hashchange', onNav)
    return () => {
      window.removeEventListener('popstate', onNav)
      window.removeEventListener('hashchange', onNav)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // состояние → хэш (клики по навигации создают шаги истории)
  useEffect(() => {
    const desired = view === 'games24' ? `#/${view}/${gamesTab}` : `#/${view}`
    if (window.location.hash === desired) return
    // хэш уже указывает на тот же раздел (например, глубокая ссылка) — нормализуем без шага истории,
    // чтобы не затирать её стартовым '#/line'
    const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
    const samePlace = parts[0] === view && (view !== 'games24' || parts[1] === gamesTab)
    if (samePlace) {
      history.replaceState(null, '', desired)
      return
    }
    if (window.location.hash === '') {
      history.replaceState(null, '', desired) // первый вход не должен плодить шаг истории
      return
    }
    history.pushState(null, '', desired)
  }, [view, gamesTab])
}
