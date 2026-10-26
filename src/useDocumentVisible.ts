import { useEffect, useState } from 'react'

// Поллинг и анимации игр не нужны, когда вкладка свёрнута:
// возвращаемся — эффекты сами перезапустятся и сразу сделают свежий запрос.
export function useDocumentVisible() {
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden))

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    const onHide = () => setVisible(false)
    const onShow = () => setVisible(true)
    document.addEventListener('visibilitychange', onChange)
    // pagehide/pageshow закрывают случай, когда вкладку уводят в bfcache
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  return visible
}
