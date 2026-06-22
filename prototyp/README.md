# Mandarin Flashcards Prototype

Staticky prototyp pre tretiu etapu diplomovej práce. Overuje základný scenár:

- identifikácia používateľa menom,
- výber balíčka kartičiek,
- zobrazenie čínskeho zápisu, pinyinu, tónov a významu,
- hlasová odpoveď cez prehliadačové rozpoznávanie reči,
- manuálny textový fallback,
- základné porovnanie odpovede,
- lokálne uloženie pokroku.

Spustenie z priečinka `thesis/prototyp`:

```bash
python3 -m http.server 5173
```

Potom otvor:

```text
http://localhost:5173
```

Hlasový vstup závisí od podpory prehliadača. Najpraktickejšie je testovať v Chrome alebo Edge s povoleným mikrofónom.
