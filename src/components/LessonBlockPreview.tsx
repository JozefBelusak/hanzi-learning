import { useEffect, useRef, useState } from 'react'
import { getActiveCatalog } from '../data/catalog'
import { parseLessonDocument, lessonBlockTypes } from '../lib/lessonBlocks'
import { describeSpeechError, isSpeechAbort, speakChinese, type SpeechIssue } from '../lib/speech'
import { emptyStudy } from '../lib/study'
import type { LecturerLessonDocument, LearningQuestion } from '../types/content'
import type { LearningAnswer } from '../types/learning'
import { QuestionTask } from './LearningSessionPage'
import FlashcardsPage from './FlashcardsPage'
import SpeechPage from './SpeechPage'
import WritingPage from './WritingPage'
import SpeechNotice from './SpeechNotice'
import './LessonBlocks.css'

function ExercisePreview({ questions, onPlay, playingText }: { questions: LearningQuestion[]; onPlay: (text: string) => void; playingText: string | null }) {
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [answers, setAnswers] = useState<Record<string, LearningAnswer>>({})
  const [hinted, setHinted] = useState<string[]>([])
  const question = questions[index]
  return <div className="session-workspace"><QuestionTask key={`${question.id}:${round}`} preview question={question} questionNumber={index + 1} total={questions.length} answer={answers[question.id]} previouslyHinted={hinted.includes(question.id)} onHint={() => setHinted((ids) => [...ids, question.id])} onCheck={(answer) => setAnswers((current) => ({ ...current, [question.id]: answer }))} onNext={() => {
    if (index === questions.length - 1) { setIndex(0); setRound((value) => value + 1); setAnswers({}); setHinted([]) } else setIndex(index + 1)
  }} onPrevious={() => setIndex(index - 1)} onPlay={onPlay} playingText={playingText} /></div>
}

export default function LessonBlockPreview({ document, title, summary }: { document: LecturerLessonDocument; title: string; summary: string }) {
  const vocabulary = getActiveCatalog().vocabulary
  const [active, setActive] = useState<{ blockId: string; mode: 'exercise' | 'flashcards' | 'speech' | 'writing' } | null>(null)
  const [study] = useState(emptyStudy)
  const [playingText, setPlayingText] = useState<string | null>(null)
  const [issue, setIssue] = useState<SpeechIssue | null>(null)
  const audio = useRef<AbortController | null>(null)
  useEffect(() => () => { const controller = audio.current; audio.current = null; controller?.abort() }, [])
  function stopAudio() { audio.current?.abort(); audio.current = null; setPlayingText(null) }
  async function play(text: string) {
    stopAudio(); setIssue(null)
    if (playingText === text) return
    const controller = new AbortController(); audio.current = controller; setPlayingText(text)
    try { await speakChinese(text, { signal: controller.signal }) }
    catch (failure) { if (!controller.signal.aborted && !isSpeechAbort(failure)) setIssue(describeSpeechError(failure)) }
    finally { if (audio.current === controller) { audio.current = null; setPlayingText(null) } }
  }
  function tryActivity(blockId: string, mode: NonNullable<typeof active>['mode']) { stopAudio(); setActive({ blockId, mode }) }
  const closeActivity = () => { stopAudio(); setActive(null) }
  return <section className="lesson-preview" aria-label="Lesson editor preview">
    <div className="lesson-preview-notice" role="note">Editor preview only. Answers, recordings and practice results are not added to your learning progress.</div>
    <h3>{title || 'Untitled lesson'}</h3>{summary && <p>{summary}</p>}
    {issue && <SpeechNotice issue={issue} />}
    {!document.blocks.length && <p>Add a block to preview your lesson.</p>}
    {document.blocks.map((block, index) => {
      let validation: string | null = null
      try { parseLessonDocument({ schemaVersion: 1, blocks: [block] }, true, vocabulary) }
      catch (failure) { validation = (failure as Error).message }
      const definition = lessonBlockTypes.find((item) => item.type === block.type)!
      const cards = 'vocabularyIds' in block ? block.vocabularyIds.flatMap((id) => { const word = vocabulary.find((item) => item.id === id); return word ? [word] : [] }) : []
      const opened = active?.blockId === block.id
      return <section className="lesson-preview-block" aria-label={`Preview block ${index + 1}: ${definition.label}`} key={block.id}>
        <span className="lesson-preview-kind">{index + 1}. {definition.label}</span>
        {block.type === 'explanation' && <>{block.heading && <h4>{block.heading}</h4>}<p className="lesson-prose">{block.text}</p>{block.grammar && <aside className="lesson-grammar-note"><h5>Grammar note</h5><p className="lesson-prose">{block.grammar}</p></aside>}</>}
        {block.type === 'example' && <div className="lesson-chinese-example"><strong lang="zh-CN">{block.example.hanzi}</strong><p>{block.example.pinyin}</p><p lang={block.translationLanguage}>{block.example.meaning}</p><button className="secondary-btn" type="button" disabled={!block.example.hanzi.trim()} onClick={() => void play(block.example.hanzi)}>{playingText === block.example.hanzi ? 'Stop audio' : 'Listen to example'}</button></div>}
        {block.type === 'vocabulary' && <><div className="word-preview-list">{cards.map((word) => <article key={word.id}><strong lang="zh-CN">{word.hanzi}</strong><span>{word.pinyin}</span><p>{word.meaning}</p></article>)}</div>{!validation && !opened && <button type="button" className="secondary-btn" onClick={() => tryActivity(block.id, 'flashcards')}>Try flashcards</button>}</>}
        {block.type === 'exercise' && <><p>{block.questions.length} {block.questions.length === 1 ? 'question' : 'questions'}</p>{!validation && !opened && <button type="button" className="secondary-btn" onClick={() => tryActivity(block.id, 'exercise')}>Try exercise</button>}</>}
        {block.type === 'practice' && <><p>{cards.map((word) => word.hanzi).join(' · ')}</p>{!validation && !opened && <div className="action-row">{block.modes.map((mode) => <button type="button" className="secondary-btn" key={mode} onClick={() => tryActivity(block.id, mode)}>{mode === 'speech' ? 'Try speaking' : 'Try writing'}</button>)}</div>}</>}
        {validation && <p className="lesson-preview-incomplete">{validation}</p>}
        {opened && <div className="lesson-preview-activity">
          <button type="button" className="text-btn" onClick={closeActivity}>Close activity preview</button>
          {active.mode === 'exercise' && block.type === 'exercise' && <ExercisePreview questions={block.questions} onPlay={(text) => void play(text)} playingText={playingText} />}
          {active.mode === 'flashcards' && <FlashcardsPage embedded cards={cards} study={study} onAttempt={() => {}} onBack={closeActivity} />}
          {active.mode === 'speech' && <SpeechPage embedded cards={cards} onAttempt={() => {}} onBack={closeActivity} />}
          {active.mode === 'writing' && <WritingPage embedded cards={cards} onAttempt={() => {}} onBack={closeActivity} />}
        </div>}
      </section>
    })}
  </section>
}
