import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, Check, Clipboard, LogOut, Plus, Users, X } from 'lucide-react'
import { useStore, type TeamRoomSyncStatus } from '../../store'

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

function statusView(syncStatus: TeamRoomSyncStatus, connected: boolean) {
  if (syncStatus === 'synced') return { label: 'Connected', icon: '●', tone: 'text-emerald-300' }
  if (syncStatus === 'syncing') return { label: 'Syncing...', icon: '◌', tone: 'text-blue-300' }
  if (syncStatus === 'offline') return { label: 'Offline', icon: '⚠', tone: 'text-amber-300' }
  if (syncStatus === 'conflict') return { label: 'Conflict', icon: '!', tone: 'text-red-300' }
  if (syncStatus === 'connecting') return { label: connected ? 'Reconnecting...' : 'Connecting...', icon: '◌', tone: 'text-blue-300' }
  return { label: 'Not connected', icon: '○', tone: 'text-slate-500' }
}

function formatMemberName(member: { clientId: string; displayName: string }, currentClientId: string) {
  return member.clientId === currentClientId ? `${member.displayName} (you)` : member.displayName
}

export default function TeamRoomPanel() {
  const { roomSession, teamSubmissionPackage, createTeamRoom, joinTeamRoom, leaveTeamRoom, resolveTeamRoomConflict, addToast } = useStore()
  const [displayName, setDisplayName] = useState(roomSession.displayName)
  const [roomCode, setRoomCode] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEffect(() => {
    if (!copiedCode) return undefined
    const timeout = window.setTimeout(() => setCopiedCode(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [copiedCode])

  useEffect(() => {
    if (!createdCode || roomSession.roomCode === createdCode) return undefined
    setCreatedCode(null)
    return undefined
  }, [createdCode, roomSession.roomCode])

  const status = statusView(roomSession.syncStatus, roomSession.connected)
  const onlineCount = roomSession.members.length
  const memberTitle = roomSession.members.map((member) => formatMemberName(member, roomSession.clientId)).join(' · ')
  const compactMembers = useMemo(() => {
    const names = roomSession.members.map((member) => formatMemberName(member, roomSession.clientId))
    if (names.length <= 4) return names.join(' · ')
    return `${names.slice(0, 3).join(' · ')} +${names.length - 3}`
  }, [roomSession.clientId, roomSession.members])

  const handleCopy = async (code: string) => {
    try {
      await copyText(code)
      setCopiedCode(code)
    } catch {
      addToast(`Copy failed. Room code: ${code}`, 'error')
    }
  }

  const handleCreate = async () => {
    const name = displayName.trim()
    if (!name) {
      setError('Name is required.')
      return
    }
    setError(null)
    setBusyAction('create')
    const code = await createTeamRoom(displayName)
    setBusyAction(null)
    if (code) {
      setCreatedCode(code)
    } else {
      setError('Could not create room.')
    }
  }

  const handleJoin = async () => {
    const name = displayName.trim()
    const normalizedCode = roomCode.trim().toUpperCase()
    if (!name) {
      setError('Name is required.')
      return
    }
    if (!normalizedCode) {
      setError('Enter a room code.')
      return
    }
    setError(null)
    setBusyAction('join')
    const joined = await joinTeamRoom(name, normalizedCode)
    setBusyAction(null)
    if (joined) {
      setRoomCode('')
    } else {
      setError('Room not found.')
    }
  }

  const handleRoomCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!busyAction) void handleJoin()
  }

  return (
    <>
      <section className="min-w-0 rounded border border-slate-800 bg-slate-950/75 p-2.5">
        {!roomSession.connected ? (
          <div className="min-w-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-100">Shared Team Room</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Work on answers together</div>
            </div>

            <label className="mt-2.5 block text-[10px] font-semibold text-slate-400">
              Your name
              <input
                value={displayName}
                maxLength={80}
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  setError(null)
                }}
                placeholder="Kent"
                className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
              />
            </label>

            <div className="mt-2 rounded border border-slate-800 bg-slate-900/55 p-2 text-[10px] text-slate-400">
              <div className="font-semibold text-slate-300">Current package</div>
              <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-500">
                <span>{teamSubmissionPackage.queryCount} queries</span>
                <span className="min-w-0 truncate">{teamSubmissionPackage.filenameTemplate}.csv</span>
              </div>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleCreate()}
              className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-2 text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={12} /> {busyAction === 'create' ? 'Creating...' : 'Create New Room'}
            </button>

            <div className="mt-3">
              <div className="text-[10px] font-semibold text-slate-400">Have a room code?</div>
              <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5 max-[360px]:grid-cols-1">
                <label className="sr-only" htmlFor="team-room-code">Room code</label>
                <input
                  id="team-room-code"
                  value={roomCode}
                  onChange={(event) => {
                    setRoomCode(event.target.value)
                    setError(null)
                  }}
                  onKeyDown={handleRoomCodeKeyDown}
                  placeholder="AIC-XXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-8 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 font-mono text-xs uppercase tracking-wide text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
                />
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleJoin()}
                  className="h-8 rounded border border-slate-700 bg-slate-900 px-3 text-[9px] font-bold uppercase tracking-wider text-slate-200 transition-colors hover:border-blue-500/60 hover:bg-blue-950/35 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'join' ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>

            {error && <div className="mt-2 rounded border border-red-900/50 bg-red-950/25 px-2 py-1.5 text-[10px] font-semibold text-red-200">{error}</div>}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-100">Shared Room</div>

            {createdCode === roomSession.roomCode && (
              <div className="mt-2 rounded border border-emerald-800/60 bg-emerald-950/25 p-2">
                <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                  <Check size={12} /> Room Created
                </div>
                <div className="mt-1 text-[10px] text-emerald-100/80">Share this code with your teammates.</div>
              </div>
            )}

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="min-w-0 rounded border border-blue-800/50 bg-blue-950/30 px-2 py-1 font-mono text-sm font-bold tracking-wider text-blue-100">
                {roomSession.roomCode}
              </span>
              <button
                type="button"
                onClick={() => roomSession.roomCode && void handleCopy(roomSession.roomCode)}
                className="inline-flex h-7 items-center justify-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 text-[8px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800"
              >
                {copiedCode === roomSession.roomCode ? <Check size={10} /> : <Clipboard size={10} />}
                {copiedCode === roomSession.roomCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            <div className={`mt-2 text-[10px] font-semibold ${status.tone}`}>
              {status.icon} {status.label}
            </div>

            <div className="mt-1 inline-flex min-w-0 items-center gap-1 text-[10px] text-slate-400">
              <Users size={12} className="shrink-0" />
              <span>{onlineCount} {onlineCount === 1 ? 'member' : 'members'} online</span>
            </div>

            {compactMembers && (
              <div className="mt-1 min-w-0 truncate text-[10px] text-slate-500" title={memberTitle}>
                {compactMembers}
              </div>
            )}

            {roomSession.syncStatus === 'offline' && (
              <div className="mt-2 rounded border border-amber-800/50 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-100">
                Changes are saved locally. Trying to reconnect...
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={leaveTeamRoom}
                className="inline-flex h-7 items-center justify-center gap-1 rounded border border-red-900/50 bg-red-950/20 px-2 text-[8px] font-bold uppercase tracking-wider text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-100"
              >
                <LogOut size={10} /> Leave Room
              </button>
            </div>
          </div>
        )}
      </section>

      {roomSession.conflict && (
        <RoomDialog title="Shared Room Conflict" onClose={() => undefined} warning>
          <div className="text-sm text-slate-200">{roomSession.conflict.message}</div>
          <div className="mt-2 text-[10px] text-slate-400">
            {roomSession.conflict.kind === 'query'
              ? `Query ${roomSession.conflict.queryNumber} changed in the room while you were editing it. Choose which version to keep.`
              : 'Reload the latest shared package, review it, then reopen Package Setup and try again.'}
          </div>
          <div className={`mt-4 grid gap-2 ${roomSession.conflict.kind === 'query' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button type="button" onClick={() => resolveTeamRoomConflict('room')} className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase text-slate-200 hover:bg-slate-800">
              {roomSession.conflict.kind === 'query' ? 'Use Room Version' : 'Reload Room State'}
            </button>
            {roomSession.conflict.kind === 'query' && (
              <button type="button" onClick={() => resolveTeamRoomConflict('local')} className="rounded bg-blue-600 px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-blue-500">Keep My Version</button>
            )}
          </div>
        </RoomDialog>
      )}
    </>
  )
}

function RoomDialog({ title, children, onClose, warning = false }: { title: string; children: ReactNode; onClose: () => void; warning?: boolean }) {
  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="w-[min(420px,94vw)] rounded-lg border border-slate-700 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
            {warning && <AlertTriangle size={15} className="text-amber-300" />}{title}
          </div>
          {!warning && <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={16} /></button>}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
