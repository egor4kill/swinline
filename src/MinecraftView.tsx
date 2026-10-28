import { useState } from 'react'
import { Link2, Sparkles } from 'lucide-react'
import MineView from './MineView'
import MinecraftUpgrader from './MinecraftUpgrader'
import type { UserAccount } from './data'

type Props = {
  currentUser: UserAccount | null
  notify: (message: string) => void
  onNeedAuth: () => void
  onPlay: () => void
  onBal: (currency: 'sv' | 'ar', bal: number) => void
}

export default function MinecraftView({ currentUser, notify, onNeedAuth, onPlay, onBal }: Props) {
  const [tab, setTab] = useState<'account' | 'upgrader'>('account')

  return (
    <div className="mc-hub">
      <div className="mc-hub-tabs" role="tablist" aria-label="Minecraft">
        <button
          type="button"
          role="tab"
          id="mc-tab-account"
          aria-selected={tab === 'account'}
          aria-controls="mc-panel-account"
          className="mc-hub-tab"
          onClick={() => setTab('account')}
        >
          <Link2 size={16} />
          Привязка и вывод
        </button>
        <button
          type="button"
          role="tab"
          id="mc-tab-upgrader"
          aria-selected={tab === 'upgrader'}
          aria-controls="mc-panel-upgrader"
          className="mc-hub-tab"
          onClick={() => setTab('upgrader')}
        >
          <Sparkles size={16} />
          Апгрейдер
        </button>
      </div>

      {tab === 'account' ? (
        <div id="mc-panel-account" role="tabpanel" aria-labelledby="mc-tab-account">
          <MineView
            mode="link"
            currentUser={currentUser}
            notify={notify}
            onNeedAuth={onNeedAuth}
            onPlay={onPlay}
            onBal={onBal}
          />
        </div>
      ) : (
        <div id="mc-panel-upgrader" role="tabpanel" aria-labelledby="mc-tab-upgrader">
          <MinecraftUpgrader
            currentUser={currentUser}
            notify={notify}
            onNeedAuth={onNeedAuth}
          />
        </div>
      )}
    </div>
  )
}
