# Kalendarz wyników

Tygodniowy kalendarz publikacji wyników spółek z USA, pokazany logotypami — w stylu
[Yahoo Finance Earnings Calendar](https://finance.yahoo.com/calendar/earnings/), ale w tym samym systemie
co [Option Toolkit](https://github.com/z0zqa/opcje): granatowy pas, jasne tło robocze, linie zamiast kart,
eucalyptus jako jedyny akcent, Archivo z cyframi tabelarycznymi i tryb ciemny wg ustawień systemu. Co niedzielę przychodzi mail z podsumowaniem
nadchodzącego tygodnia i zrzutem ekranu z aplikacji.

![Tydzień w aplikacji](docs/preview.png)

## Co jest w aplikacji

- Pięć kolumn (pon–pt), w każdej sesje **przed otwarciem**, **po zamknięciu** i **godzina nieustalona**.
- Domyślnie 9 największych spółek (wg kapitalizacji) na sesję, reszta pod „+ N więcej”.
- Logotypy w monochromie, kolor po najechaniu albo przełącznikiem **Kolor**.
- Kliknięcie w spółkę: kapitalizacja, konsensus EPS, EPS rok temu, zmiana r/r, kwartał, liczba szacunków.
- Watchlista (obwódka w kolorze eucalyptus), filtr **Watchlista**, wyszukiwarka, nawigacja strzałkami ← →.
- Działa z dysku (`index.html`) i na telefonie.

Dane: publiczne API kalendarza Nasdaq (bez klucza). Logotypy: Financial Modeling Prep, zapasowo Parqet,
a gdy brak obu — monogram z tickera.

## Uruchomienie lokalnie

```bash
npm install
npm run fetch        # pobiera tydzień wstecz + 3 tygodnie naprzód do data/
open index.html      # albo: npm start → http://localhost:4321
npm run digest:dry   # buduje maila i zrzut do out/ bez wysyłania
```

## Konfiguracja (`config.json`)

| Pole | Znaczenie |
| --- | --- |
| `perSession` | ile logotypów na sesję przed „+ N więcej” |
| `watchlist` | tickery wyróżniane w aplikacji i w mailu |
| `weeksBack`, `weeksAhead` | zakres pobierania |
| `keepWeeks` | ile tygodni historii trzymać w `data/` |

Po zmianie uruchom `npm run fetch` (odświeża też `config.js` dla przeglądarki).

## Niedzielny mail

Workflow **Niedzielny mail** (`.github/workflows/weekly-digest.yml`) startuje w niedzielę o 16:07 UTC:
pobiera świeże dane, robi zrzut nadchodzącego tygodnia w Playwright i wysyła maila przez SMTP.
Mail zawiera: liczbę raportów, spółki z watchlisty, 10 największych spółek, przegląd dzień po dniu
i zrzut kalendarza (w treści i w załączniku).

Ustaw w **Settings → Secrets and variables → Actions**:

| Sekret | Wartość |
| --- | --- |
| `SMTP_USER` | adres Gmail, z którego idzie mail |
| `SMTP_PASS` | [hasło aplikacji Google](https://myaccount.google.com/apppasswords) (wymaga 2FA), nie zwykłe hasło |
| `MAIL_TO` | adresat (opcjonalnie; domyślnie `SMTP_USER`) |

Zmienne (opcjonalne): `APP_URL` — link „Otwórz aplikację” w mailu; `SMTP_HOST` / `SMTP_PORT` dla
innego serwera niż Gmail.

Test: **Actions → Niedzielny mail → Run workflow** (opcja „Tylko zbuduj maila” zostawia wynik w artefakcie
`digest`).

Harmonogramy GitHub Actions działają tylko na domyślnej gałęzi (`main`).

## Publikacja (opcjonalnie)

`pages.yml` wrzuca aplikację na GitHub Pages po każdej aktualizacji danych. Włącz Pages
(Source: GitHub Actions) i ustaw zmienną `PAGES_ENABLED=true`. Dla prywatnego repozytorium Pages wymaga
planu GitHub Pro; bez tego aplikacja działa lokalnie, a mail i tak przychodzi.
