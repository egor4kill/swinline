import { useState } from 'react'
import { ADMIN_USERNAME } from '../supabase'

export const PigLogo = () => (
  <svg width="28" height="28" viewBox="0 0 100 100" role="img" aria-label="Свин-маскот SWINLINE">
    <use href="#pig" />
  </svg>
)

export const getTwitchAvatar = (username?: string, currentAvatar?: string | null): string => {
  if (currentAvatar && (currentAvatar.startsWith('http://') || currentAvatar.startsWith('https://'))) {
    return currentAvatar
  }
  const u = (username || '').toLowerCase().trim()
  if (u === ADMIN_USERNAME.toLowerCase()) {
    return 'https://static-cdn.jtvnw.net/jtv_user_pictures/310827f8-113e-442f-9435-bf8637ec3b6a-profile_image-300x300.png'
  }
  if (u === 'lowrensy') {
    return 'https://static-cdn.jtvnw.net/jtv_user_pictures/6d72a4ce-1517-408b-8d79-2490b31fa178-profile_image-300x300.png'
  }
  if (currentAvatar && currentAvatar !== '👑' && currentAvatar !== '🐗' && currentAvatar !== '🟣') {
    return currentAvatar
  }
  return '🟣'
}

export const UserAvatar = ({
  avatar,
  name,
  size = 28,
  className = ''
}: {
  avatar?: string | null
  name?: string
  size?: number
  crown?: boolean
  className?: string
}) => {
  const [hasError, setHasError] = useState(false)
  const resolved = getTwitchAvatar(name, avatar)
  const isImage = !hasError && Boolean(resolved && (resolved.startsWith('http://') || resolved.startsWith('https://') || resolved.startsWith('/') || resolved.startsWith('data:')))

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: '#1a1f2c',
        border: '1px solid rgba(255,255,255,0.18)',
        overflow: 'hidden'
      }}
    >
      {isImage ? (
        <img
          src={resolved}
          alt={name || 'Avatar'}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block'
          }}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.55, fontWeight: 700, userSelect: 'none', color: '#fff' }}>
          {resolved && resolved.length <= 2 && resolved !== '🟣' ? resolved : (name ? name[0].toUpperCase() : '👤')}
        </span>
      )}
    </div>
  )
}
