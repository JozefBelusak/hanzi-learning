import { useState } from 'react'
import './ToneGuide.css'

const tones = [
  { mark: 'mā', title: 'Level', path: 'M 10 20 H 110', description: 'High and steady.', color: '#326b9b' },
  { mark: 'má', title: 'Rising', path: 'M 10 60 Q 60 50 110 16', description: 'Moves upwards.', color: '#377d62' },
  { mark: 'mǎ', title: 'Third', path: 'M 10 38 Q 48 90 70 66 T 110 28', description: 'Low; a full rise depends on context.', color: '#826295' },
  { mark: 'mà', title: 'Falling', path: 'M 10 16 Q 62 36 110 72', description: 'Moves downwards.', color: '#a36735' },
]

export default function ToneGuide() {
  const [replay, setReplay] = useState(0)
  return (
    <section className="tone-guide" aria-label="Illustrated tone patterns">
      <div className="tone-guide-heading"><h3>A little pitch journey</h3><button type="button" className="text-btn" onClick={() => setReplay((value) => value + 1)}>Replay shapes</button></div>
      <div className="tone-guide-grid">
        {tones.map((tone, index) => (
          <div className="tone-guide-card" key={tone.mark}>
            <strong>{tone.mark}</strong>
            <svg viewBox="0 0 120 90" aria-hidden="true" key={replay}>
              <path d="M 10 10 V 80 H 115" stroke="#dee5da" fill="none" />
              <path className="tone-guide-contour" pathLength="1" d={tone.path} fill="none" stroke={tone.color} strokeWidth="5" strokeLinecap="round" />
            </svg>
            <span>{index + 1}. {tone.title}</span><small>{tone.description}</small>
          </div>
        ))}
      </div>
      <p>These are teaching sketches, not measurements of your voice. In a phrase, third tones often stay low and neutral tones depend on context.</p>
    </section>
  )
}
