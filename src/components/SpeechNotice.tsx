import { useEffect, useId, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { describeSpeechError, isSpeechAbort, speakChinese, type SpeechIssue } from '../lib/speech'
import { browserNames, detectVoiceEnvironment, systemNames, voiceSetupGuide, type VoiceEnvironment } from '../lib/voiceSetup'
import './SpeechNotice.css'

type VoiceNavigator = Navigator & { brave?: { isBrave?: () => Promise<boolean> }; userAgentData?: { brands: { brand: string }[] } }
function environment() {
  const device = navigator as VoiceNavigator
  return detectVoiceEnvironment({ userAgent: device.userAgent, platform: device.platform, maxTouchPoints: device.maxTouchPoints, brands: device.userAgentData?.brands, native: Capacitor.isNativePlatform() })
}

export default function SpeechNotice({ issue, className = 'error-message', role = 'alert' }: { issue: SpeechIssue; className?: string; role?: 'alert' | 'status' }) {
  const [open, setOpen] = useState(false)
  const [device, setDevice] = useState<VoiceEnvironment>(environment)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState('')
  const [ready, setReady] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const id = useId()
  const guide = voiceSetupGuide(device)
  useEffect(() => {
    let active = true
    const brave = (navigator as VoiceNavigator).brave
    if (open && brave?.isBrave && !Capacitor.isNativePlatform()) {
      void Promise.resolve().then(() => brave.isBrave!()).then((detected) => { if (active && detected) setDevice((previous) => ({ ...previous, browser: 'brave' })) }).catch(() => undefined)
    }
    return () => { active = false }
  }, [open])
  useEffect(() => () => operation.current?.abort(), [])
  async function testVoice() {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setTesting(true); setResult(''); setReady(false)
    try {
      await speakChinese('你好', { signal: controller.signal })
      if (!controller.signal.aborted) { setReady(true); setResult('Mandarin voice is ready. Try Listen again.') }
    } catch (error) {
      if (!isSpeechAbort(error) && !controller.signal.aborted) setResult(describeSpeechError(error).voiceMissing ? 'No Mandarin audio yet. Finish the download and restart your browser or app, then try again.' : 'The voice could not play. Check your sound output and connection, then try again.')
    } finally {
      if (!controller.signal.aborted) setTesting(false)
      if (operation.current === controller) operation.current = null
    }
  }
  return <div className={`speech-notice ${className}`}>
    <div className="speech-notice-heading"><span role={ready ? 'status' : role}>{ready ? 'Mandarin voice is ready.' : issue.message}</span>{issue.voiceMissing && <button type="button" className="speech-setup-toggle" aria-expanded={open} aria-controls={id} onClick={() => { if (open) { operation.current?.abort(); operation.current = null; setTesting(false) } setOpen((value) => !value) }}><span aria-hidden="true">ⓘ</span> Set up voice</button>}</div>
    {issue.voiceMissing && open && <section id={id} className="voice-setup" aria-label="Mandarin voice setup">
      <h2>Add a Mandarin voice</h2><p className="voice-setup-device">{browserNames[device.browser]} · {systemNames[device.system]}</p>
      <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="voice-setup-links">{guide.settings && <a href={guide.settings}>Open speech settings</a>}<a href={guide.url} target="_blank" rel="noreferrer">{guide.label}</a></div>
      <button type="button" className="secondary-btn" disabled={testing} onClick={() => void testVoice()}>{testing ? 'Testing voice…' : 'Test Mandarin voice'}</button>
      {result && <p role="status">{result}</p>}
      <details className="voice-device-change"><summary>Change detected device</summary><label>Browser<select aria-label="Browser" value={device.browser} onChange={(event) => setDevice({ ...device, browser: event.target.value as VoiceEnvironment['browser'] })}>{Object.entries(browserNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Operating system<select aria-label="Operating system" value={device.system} onChange={(event) => setDevice({ ...device, system: event.target.value as VoiceEnvironment['system'] })}>{Object.entries(systemNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></details>
      <small>These steps add playback voices, not speech recognition. A website cannot install a system voice automatically.</small>
    </section>}
  </div>
}
