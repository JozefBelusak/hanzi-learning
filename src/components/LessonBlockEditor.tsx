import { useState } from 'react'
import { getActiveCatalog } from '../data/catalog'
import { lessonBlockTypes, moveLessonBlock, newLessonBlock } from '../lib/lessonBlocks'
import type { LecturerLessonBlock, LecturerLessonDocument } from '../types/content'
import { QuestionFields, ReferencePicker } from './admin/ContentFields'
import LessonExampleFields from './LessonExampleFields'
import './admin/PlatformContentAdmin.css'
import './LessonBlocks.css'

export default function LessonBlockEditor({ document, onChange }: { document: LecturerLessonDocument; onChange: (document: LecturerLessonDocument) => void }) {
  const [collapsed, setCollapsed] = useState(() => document.blocks.slice(1).map((block) => block.id))
  const [removed, setRemoved] = useState<{ block: LecturerLessonBlock; index: number } | null>(null)
  const vocabulary = getActiveCatalog().vocabulary
  const update = (id: string, value: LecturerLessonBlock) => onChange({ ...document, blocks: document.blocks.map((block) => block.id === id ? value : block) })
  function remove(block: LecturerLessonBlock, index: number) {
    setRemoved({ block, index })
    onChange({ ...document, blocks: document.blocks.filter((item) => item.id !== block.id) })
  }
  function undoRemoval() {
    if (!removed || document.blocks.length >= 40 || document.blocks.some((block) => block.id === removed.block.id)) return
    const blocks = [...document.blocks]
    blocks.splice(Math.min(removed.index, blocks.length), 0, removed.block)
    onChange({ ...document, blocks })
    setCollapsed((ids) => ids.filter((id) => id !== removed.block.id))
    setRemoved(null)
  }
  return <div className="lesson-block-editor">
    <div className="lesson-block-heading"><h4>Lesson blocks</h4><span>{document.blocks.length} / 40</span></div>
    {removed && <div className="lesson-block-undo" role="status"><span>{lessonBlockTypes.find((item) => item.type === removed.block.type)?.label} block removed.{document.blocks.length >= 40 ? ' The lesson is full; no more blocks can be restored.' : ''}</span><button className="text-btn" type="button" onClick={undoRemoval} disabled={document.blocks.length >= 40}>Undo</button></div>}
    {!document.blocks.length && <div className="lesson-block-empty"><span lang="zh-CN" aria-hidden="true">文</span><h4>Start with one idea</h4><p>Add an explanation, a Chinese example or an activity.</p></div>}
    <div className="lesson-block-list">
      {document.blocks.map((block, index) => {
        const definition = lessonBlockTypes.find((item) => item.type === block.type)!
        const expanded = !collapsed.includes(block.id)
        return <section className="lesson-editor-block" aria-label={`Block ${index + 1}: ${definition.label}`} key={block.id}>
          <header><div><span className="lesson-block-symbol" lang="zh-CN" aria-hidden="true">{definition.symbol}</span><h4><button type="button" className="lesson-block-toggle" aria-label={`${expanded ? 'Collapse' : 'Expand'} block ${index + 1}`} aria-expanded={expanded} aria-controls={`${block.id}-fields`} onClick={() => setCollapsed((ids) => expanded ? [...ids, block.id] : ids.filter((id) => id !== block.id))}>{index + 1}. {definition.label}<span aria-hidden="true">{expanded ? '−' : '+'}</span></button></h4></div><div className="lesson-block-tools">
            <button type="button" className="text-btn" aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => onChange(moveLessonBlock(document, block.id, -1))}>Move up</button>
            <button type="button" className="text-btn" aria-label={`Move block ${index + 1} down`} disabled={index === document.blocks.length - 1} onClick={() => onChange(moveLessonBlock(document, block.id, 1))}>Move down</button>
            <button type="button" className="text-btn" aria-label={`Remove block ${index + 1}`} onClick={() => remove(block, index)}>Remove</button>
          </div></header>
          <div className="lesson-block-fields" id={`${block.id}-fields`} hidden={!expanded}>
            {block.type === 'explanation' && <>
              <label>Heading (optional)<input maxLength={200} value={block.heading} onChange={(event) => update(block.id, { ...block, heading: event.target.value })} /></label>
              <label>Explanation text<textarea aria-label="Explanation text" rows={5} maxLength={50000} value={block.text} onChange={(event) => update(block.id, { ...block, text: event.target.value })} /></label>
              <label>Grammar explanation (optional)<textarea aria-label="Grammar explanation (optional)" rows={3} maxLength={10000} value={block.grammar} onChange={(event) => update(block.id, { ...block, grammar: event.target.value })} /></label>
            </>}
            {block.type === 'example' && <LessonExampleFields block={block} vocabulary={vocabulary} onChange={(value) => update(block.id, value)} />}
            {(block.type === 'vocabulary' || block.type === 'practice') && <ReferencePicker title="Vocabulary" maxSelection={50} options={vocabulary.filter((word) => !word.archived || block.vocabularyIds.includes(word.id)).map((word) => ({ id: word.id, title: `${word.hanzi} · ${word.pinyin} · ${word.meaning}${word.archived ? ' [archived]' : ''}` }))} selected={block.vocabularyIds} onChange={(vocabularyIds) => update(block.id, { ...block, vocabularyIds })} />}
            {block.type === 'practice' && <fieldset className="lesson-practice-modes"><legend>Practice modes</legend>{(['speech', 'writing'] as const).map((mode) => <label className="checkbox-field" key={mode}><input type="checkbox" checked={block.modes.includes(mode)} onChange={() => update(block.id, { ...block, modes: block.modes.includes(mode) ? block.modes.filter((item) => item !== mode) : [...block.modes, mode] })} />{mode === 'speech' ? 'Speaking and pronunciation' : 'Character writing'}</label>)}</fieldset>}
            {block.type === 'exercise' && <QuestionFields questions={block.questions} maxQuestions={20} onChange={(questions) => update(block.id, { ...block, questions })} />}
          </div>
        </section>
      })}
    </div>
    <fieldset className="lesson-add-block"><legend>Add a block</legend><div>{lessonBlockTypes.map((block) => <button type="button" className="secondary-btn" aria-label={`Add ${block.label.toLowerCase()} block`} key={block.type} disabled={document.blocks.length >= 40} onClick={() => onChange({ ...document, blocks: [...document.blocks, newLessonBlock(block.type)] })}><span lang="zh-CN" aria-hidden="true">{block.symbol}</span><span><strong>{block.label}</strong><small>{block.description}</small></span></button>)}</div></fieldset>
  </div>
}
