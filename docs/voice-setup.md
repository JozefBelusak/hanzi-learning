# Missing Mandarin voice: guided setup

A missing playback voice shows **Set up voice** in speaking, flashcards and lesson examples, including guest previews. Expanding it provides device-specific setup steps, an official support link and **Test Mandarin voice**. On Windows it also offers an explicit `ms-settings:speech` link; the browser may ask permission to open Settings. No installer is downloaded or run by the app.

Browser hints distinguish Edge, Firefox, Opera, Brave, Chrome and Safari. Brave's optional local `isBrave()` signal is checked only when opening help. Device hints distinguish Windows, macOS, iPhone/iPad, Android and Linux, including iPad desktop mode. Native apps are labelled separately. Detection is advisory, never a capability check: a collapsed correction form lets the user choose a different browser/device. No device hints are stored or sent to an API.

The installation guide is selected by operating system, with browser-specific restart instructions. Changing the browser interface language does not install a playback voice. Browser/device versions may expose different voices; the app still requires a Mandarin voice from the actual speech API. Installing a playback voice does not enable unsupported speech recognition.

The test reuses `speakChinese('你好')`, freshly reading the voice list and playing a short sample. It creates no learning attempt or score. Closing help or leaving the screen cancels a pending test. Success means that this playback completed, not that microphone recognition or acoustic tone assessment is available. Playback failures and missing voices remain distinct from microphone permission/network failures.

Sources checked for this implementation:

- [Microsoft: supported languages, voices and installation](https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices)
- [Microsoft: Windows Settings URI reference](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)
- [Apple: change the Mac speaking voice](https://support.apple.com/guide/mac-help/mchlp2290/mac)
- [Apple: iPhone spoken content and voices](https://support.apple.com/guide/iphone/iph96b214f0/ios)
- [Google: Android text-to-speech output and voice data](https://support.google.com/accessibility/android/answer/6006983?hl=en)
- [MDN: voices exposed by the browser](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)

Linux instructions remain general because speech services and browser integration vary by distribution; the app does not suggest an unverified universal package command. No new speech service, browser-specific recognition engine or backend integration is introduced.
