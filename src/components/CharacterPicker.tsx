import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { WritingCharacter } from '../lib/writing'

type CharacterPickerProps = {
  characters: WritingCharacter[]
  selected: string
  onSelect: (character: string) => void
  onClose: () => void
}

function searchable(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export default function CharacterPicker({ characters, selected, onSelect, onClose }: CharacterPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const search = searchable(query.trim())
  const matches = characters.filter(({ character, card }) =>
    searchable(`${character} ${card.hanzi} ${card.pinyin} ${card.meaning}`).includes(search),
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    searchRef.current?.focus()

    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="character-picker"
      aria-labelledby="character-picker-title"
      onKeyDown={keepFocusInside}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }}
    >
      <header className="character-picker-header">
        <h2 id="character-picker-title">Choose a character</h2>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </header>
      <div className="character-picker-search">
        <label className="sr-only" htmlFor="character-search">Search characters</label>
        <input
          ref={searchRef}
          id="character-search"
          type="search"
          placeholder="Character, pinyin or meaning"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="character-picker-content">
        {matches.length === 0 ? (
          <p className="character-picker-empty" role="status">No characters match your search.</p>
        ) : (
          <div className="character-grid">
            {matches.map(({ character, card }) => (
              <button
                key={character}
                type="button"
                className="character-card"
                aria-label={`Practice ${character}`}
                aria-pressed={character === selected}
                onClick={() => onSelect(character)}
              >
                <span className="character-card-hanzi" lang="zh-CN">{character}</span>
                <span className="character-card-word" lang="zh-CN">{card.hanzi}</span>
                <span className="character-card-pinyin">{card.pinyin}</span>
                <span className="character-card-meaning">{card.meaning}</span>
                {character === selected && <span className="character-card-selected">Selected</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  )
}
