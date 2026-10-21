# Thursday Sign In

A prank page that asks "Do you need a Bustan sign in for Thursday?" Both **Yes** and **No** lead to a jumpscare.

- After the tap, a "getting your sign in ready" screen runs for about 8.6 seconds. Steps tick off, a progress bar crawls, and a confirmation code types out slowly in small print. Then it hard-cuts to a full-screen face with a scream.
- The face slams in from huge, shakes, and lunges again. White, negative-image and red flashes play over it, spaced so there are never more than three in any second.
- Made for phones: plays sound even with the iPhone silent switch on, and vibrates on Android. All effects are CSS animations, so they stay smooth.
- The sound is `scream.mp3`: a soft music box from `tools/make-scream.html` with a recorded scream spliced in at 8.6 s (`LEAD` in `script.js`). The tool page has the ffmpeg command.
- The face is `scare.jpg`, and `scare-neg.jpg` is its inverted copy for the flashes.
- After the scare, a 😂 screen with "Send the link", "watch it again", and a "Made by SK" watermark.

## Host it on GitHub Pages

Repo → **Settings → Pages** → Source: `Deploy from a branch` → `main` / `(root)` → Save.

⚠️ Don't send it to anyone with a heart condition, epilepsy, or anxiety. Keep it fun.
