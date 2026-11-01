import { useState } from 'react'
import { exportStudyData } from '../lib/storage'
import { vocabularyInfo } from '../lib/vocabulary'
import type { StudyData } from '../types/study'
import type { UserProfile } from '../types/auth'
import type { LearningProfileInput } from '../lib/profile'
import LearningProfileForm from './LearningProfileForm'
import { getActiveCatalog } from '../data/catalog'

type Props = {
  study: StudyData
  profile: UserProfile
  onSaveProfile: (input: LearningProfileInput) => Promise<void>
  onImport: (raw: string) => StudyData
  onRefresh: () => void
  refreshing: boolean
  notice: string | null
  onImportPrevious: () => Promise<StudyData>
}

export default function SettingsPage({ study, profile, onSaveProfile, onImport, onRefresh, refreshing, notice, onImportPrevious }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        <LearningProfileForm profile={profile} onSave={onSaveProfile} />
        <div className="card-surface">
          <h2>Progress backup</h2>
          <p>Export your progress to use it on another device. Importing merges histories without duplicate attempts. Your account name, learning preferences and daily goal stay as saved in your profile.</p>
          <button className="secondary-btn" type="button" disabled={busy} onClick={() => void exportBackup()}>Export progress</button>
          <label className="import-label" htmlFor="progress-import">Import progress backup</label>
          <input id="progress-import" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void file.text().then((raw) => {
              onImport(raw)
              setMessage('Backup history was merged.')
            })
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not read the backup.'))
          }} />
          <details className="practice-help"><summary>Progress from before accounts</summary><p>Your progress is now stored separately for each account on this device. You can explicitly merge the earlier local progress into this account.</p><button type="button" className="secondary-btn" disabled={busy} onClick={() => {
            setBusy(true)
            void onImportPrevious().then(() => { setMessage('Previous local progress was merged into this account.') }).catch(() => setMessage('Could not import the previous local progress.')).finally(() => setBusy(false))
          }}>Import previous local progress</button></details>
        </div>
      </section>
      {message && <p role="status" className="status-message">{message}</p>}
      <section className="card-surface source-settings">
        <h2>Vocabulary</h2>
        <p>{getActiveCatalog().vocabulary.filter((word) => !word.archived).length} words in the platform catalog, with English meanings. Original public vocabulary: <a href={vocabularyInfo.url} target="_blank" rel="noreferrer">HearMandarin</a>, {vocabularyInfo.selection}. Refresh loads the latest published catalog when platform administration is configured.</p>
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
