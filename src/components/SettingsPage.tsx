import { useState, type FormEvent } from 'react'
import { exportStudyData } from '../lib/storage'
import { vocabularyInfo } from '../lib/vocabulary'
import type { StudyData } from '../types/study'

type Props = {
  study: StudyData
  onProfile: (name: string, goal: number) => void
  onImport: (raw: string) => StudyData
  onRefresh: () => void
  refreshing: boolean
  notice: string | null
  onImportPrevious: () => Promise<StudyData>
}

export default function SettingsPage({ study, onProfile, onImport, onRefresh, refreshing, notice, onImportPrevious }: Props) {
  const [name, setName] = useState(study.displayName)
  const [goal, setGoal] = useState(study.dailyGoal)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function saveProfile(event: FormEvent) {
    event.preventDefault()
    onProfile(name, goal)
    setMessage('Preferences saved.')
  }
  async function exportBackup() {
    setBusy(true)
    setMessage(null)
    try { await exportStudyData(study); setMessage('Your progress backup is ready.') }
    catch { setMessage('Could not export the backup. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <section className="settings-grid">
        <form className="card-surface profile-form" onSubmit={saveProfile}>
          <h2>Profile and daily goal</h2>
          <label htmlFor="profile-name">What should we call you?</label>
          <input id="profile-name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name (optional)" />
          <label htmlFor="daily-goal">Daily goal · attempts</label>
          <input id="daily-goal" type="number" min={1} max={100} required value={goal} onChange={(event) => setGoal(Number(event.target.value))} />
          <button type="submit">Save preferences</button>
        </form>
        <div className="card-surface">
          <h2>Progress backup</h2>
          <p>Export your progress to use it on another device. Importing merges histories without duplicate attempts.</p>
          <button className="secondary-btn" type="button" disabled={busy} onClick={() => void exportBackup()}>Export progress</button>
          <label className="import-label" htmlFor="progress-import">Import progress backup</label>
          <input id="progress-import" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void file.text().then((raw) => {
              const imported = onImport(raw)
              setName(imported.displayName)
              setGoal(imported.dailyGoal)
              setMessage('Backup history was merged.')
            })
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not read the backup.'))
          }} />
          <details className="practice-help"><summary>Progress from before accounts</summary><p>Your progress is now stored separately for each account on this device. You can explicitly merge the earlier local progress into this account.</p><button type="button" className="secondary-btn" disabled={busy} onClick={() => {
            setBusy(true)
            void onImportPrevious().then((imported) => { setName(imported.displayName); setGoal(imported.dailyGoal); setMessage('Previous local progress was merged into this account.') }).catch(() => setMessage('Could not import the previous local progress.')).finally(() => setBusy(false))
          }}>Import previous local progress</button></details>
        </div>
      </section>
      {message && <p role="status" className="status-message">{message}</p>}
      <section className="card-surface source-settings">
        <h2>Vocabulary</h2>
        <p>150 beginner words from <a href={vocabularyInfo.url} target="_blank" rel="noreferrer">HearMandarin</a>, HSK 2.0 level 1, with English meanings.</p>
        <button className="secondary-btn" type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh vocabulary'}</button>
        {notice && <p role="status" className="status-message">{notice}</p>}
        <details className="practice-help">
          <summary>Sources and licences</summary>
          <p>Vocabulary: HearMandarin, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Topics and example sentences are created for this app.</p>
          <p>Writing: <a href="https://hanziwriter.org/" target="_blank" rel="noreferrer">Hanzi Writer</a> (<a href="licenses/hanzi-writer-LICENSE.txt">MIT</a>) and Hanzi Writer Data, derived from Make Me a Hanzi (<a href="licenses/hanzi-writer-data-LICENSE.txt">Arphic Public License</a>).</p>
        </details>
      </section>
    </main>
  )
}
