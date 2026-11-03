import { useId, useRef, useState } from 'react'
import type { LecturerLessonBlock, VocabularyEntry } from '../types/content'
import { ReferencePicker } from './admin/ContentFields'

type ExampleBlock = Extract<LecturerLessonBlock, { type: 'example' }>

export default function LessonExampleFields({ block, vocabulary, onChange }: { block: ExampleBlock; vocabulary: VocabularyEntry[]; onChange: (block: ExampleBlock) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const pickerId = useId()
  const sourceButton = useRef<HTMLButtonElement>(null)
  const characters = useRef<HTMLInputElement>(null)
  const words = vocabulary.filter((word) => !word.archived)
  const matchingWord = words.find((word) => word.hanzi === block.example.hanzi && word.pinyin === block.example.pinyin)

  function selectWord(id: string) {
    const word = words.find((item) => item.id === id)
    if (!word) return
    const replacesText = (block.example.hanzi.trim() && block.example.hanzi !== word.hanzi) || (block.example.pinyin.trim() && block.example.pinyin !== word.pinyin)
    if (replacesText && !window.confirm('Replace the current Chinese characters and pinyin with this word? Your translation will be kept for review.')) return
    const keepTranslation = Boolean(block.example.meaning.trim())
    onChange({ ...block, example: {
      hanzi: word.hanzi, pinyin: word.pinyin,
      meaning: keepTranslation ? block.example.meaning : block.translationLanguage === 'en' ? word.meaning : '',
    } })
    setNotice(keepTranslation ? 'Word inserted. Review your translation for this example.' : block.translationLanguage === 'sk' ? 'Word inserted. Add your Slovak translation below.' : 'Word inserted. Review the English translation below.')
    setPickerOpen(false)
    characters.current?.focus()
  }

  return <>
    <div className="lesson-example-actions">
      <button ref={sourceButton} type="button" className="secondary-btn" aria-expanded={pickerOpen} aria-controls={pickerId} onClick={() => setPickerOpen((open) => !open)}>Choose from catalog</button>
      <button type="button" className="text-btn" onClick={() => { setPickerOpen(false); setNotice(''); characters.current?.focus() }}>Write your own sentence</button>
    </div>
    <small>Find a word by Chinese characters, pinyin or English meaning, or use a Chinese keyboard to write or paste your own sentence.</small>
    {pickerOpen && <div id={pickerId} className="lesson-example-picker" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPickerOpen(false); sourceButton.current?.focus() }
    }}>
      <ReferencePicker title="Catalog words" selectionMode="single" autoFocusSearch options={words.map((word) => ({ id: word.id, title: `${word.hanzi} · ${word.pinyin} · ${word.meaning}` }))} selected={matchingWord ? [matchingWord.id] : []} onChange={(ids) => selectWord(ids[0])} />
    </div>}
    {notice && <p className="lesson-example-notice" role="status">{notice}</p>}
    <label>Chinese characters<input ref={characters} lang="zh-CN" placeholder="e.g. 我喝水。" maxLength={2000} value={block.example.hanzi} onChange={(event) => { setNotice(''); onChange({ ...block, example: { ...block.example, hanzi: event.target.value } }) }} /></label>
    <label>Pinyin<input placeholder="e.g. Wǒ hē shuǐ." maxLength={2000} value={block.example.pinyin} onChange={(event) => onChange({ ...block, example: { ...block.example, pinyin: event.target.value } })} /></label>
    {matchingWord && <aside className="lesson-example-meaning"><strong>Catalog meaning (English)</strong><span>{matchingWord.meaning}</span></aside>}
    <label>Translation language<select aria-label="Translation language" value={block.translationLanguage} onChange={(event) => onChange({ ...block, translationLanguage: event.target.value as 'sk' | 'en' })}><option value="sk">Slovak</option><option value="en">English</option></select></label>
    <label>{block.translationLanguage === 'sk' ? 'Slovak translation' : 'English translation'}<textarea aria-label={block.translationLanguage === 'sk' ? 'Slovak translation' : 'English translation'} rows={2} lang={block.translationLanguage} maxLength={2000} value={block.example.meaning} onChange={(event) => onChange({ ...block, example: { ...block.example, meaning: event.target.value } })} /></label>
    <small>For your own sentences, check the pinyin and translation before publishing. Open Preview to listen to the example.</small>
  </>
}
