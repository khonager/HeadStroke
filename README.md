# HeadStroke

A local sketchbook for Even G2. Move your head to move the cursor. Exposure accumulates: repeated passes and slow movement brighten a mark; fast travel leaves a fainter line. Tap once to pause or resume. Drawings and sensitivity stay on your phone inside the normal Even Realities app. No separate phone app, backend, API keys, or public store listing are required.

**Status:** hardware-test build, not a verified hardware release. The official SDK supplies IMU samples, but does not document their physical axes or units. HeadStroke learns two directions from a three-position calibration. Whether turning your head is observable, how much tilt is needed, and display latency must be checked on your G2. If turning is not detected, try a small sideways tilt. It does not claim absolute yaw tracking.

## Development with Nix

From this directory:

```sh
nix develop
npm ci
npm run dev
```

The locked flake provides Node/npm, Chromium for browser tests, and the GTK/WebKit/audio libraries used by the official Linux simulator. They are scoped to the development environment; nothing is added to your NixOS system configuration. JavaScript dependencies are pinned by `package-lock.json` and installed locally with `npm ci`. No global npm installs or Playwright browser downloads are needed.

The flake supports x86_64-linux and aarch64-linux; x86_64 is the tested target. If flakes are disabled in your Nix installation, use `nix --extra-experimental-features 'nix-command flakes' develop`.

## First test on your own glasses — no upload

1. Update the normal **Even Realities** phone app (SDK 0.0.16 requires app 2.2.10 or later) and G2 firmware. Pair the glasses normally. The R1 ring is optional; temple taps work.
2. Sign in at [Even Hub](https://hub.evenrealities.com/login) with **the same account as on your phone**. This enables the developer section; no app submission is involved. Force-quit and reopen the phone app.
3. Put the computer and phone on the same reachable Wi-Fi network. Keep `npm run dev` running from the first terminal.
4. In a second terminal in this directory, run:

   ```sh
   nix develop
   npm run qr -- --ip YOUR_COMPUTER_LAN_IP
   ```

   Replace `YOUR_COMPUTER_LAN_IP` with your computer's Wi-Fi IPv4 address (for example `192.168.1.50`). The Vite terminal shows `Network:` addresses; choose your Wi-Fi address, not a VPN/container interface. You can also supply the entire address:

   ```sh
   npx evenhub qr --url http://192.168.1.50:5173
   ```

5. On your phone, open **Even Hub → developer section at the top right → Scan QR** (also called Prototype Mode/Dev Preview in some versions). Scan the terminal QR **inside the Even app**, not with the general camera app.
6. HeadStroke should appear on the glasses and in the phone's embedded app view. It starts paused with guided calibration. Hold each position for about a second, then single-tap: **straight ahead → comfortably right → return toward center and look up**. A small rightward tilt can substitute if head turning is not visible to the sensor. Return to your forward-facing position, then tap to draw.
7. Try a short stroke, pause, reposition, resume, retrace it, then save and reopen it. Start at sensitivity **1.0×**, adjusting to comfort.

**Keep the phone awake and the Even app foregrounded during QR testing.** Local Testing is a live connection to your computer, not a permanent install. Locking the phone or switching apps can suspend it. Close HeadStroke and re-scan the QR after that, or after a code change. Your computer must keep running the dev server. Browser preview is only a mouse/touch test; opening the URL in Safari/Chrome does not connect it to the glasses.

If the QR does not load:

- Open `http://YOUR_COMPUTER_LAN_IP:5173` in the phone's browser just to check network reachability. If it cannot open, check the address, Wi-Fi client isolation and the computer firewall. The flake deliberately does not modify your firewall; TCP port 5173 must be reachable during the test.
- On NixOS, if the firewall is the problem, you can temporarily allow the test port without editing your system configuration: `sudo nixos-firewall-tool open tcp 5173`. After testing, `sudo nixos-firewall-tool reset` restores the configured firewall rules (and removes any other temporary rules made with that tool). These commands are optional; HeadStroke does not run them automatically.
- A phone hotspot is another option if Wi-Fi clients cannot talk to one another.
- If the browser page loads but the glasses do not, return to the **Even app's scanner**, check that G2 is connected, and re-scan. If the embedded view offers “Try browser preview,” the native host bridge was not detected; preview does not replace the glasses connection.
- A rejected calibration is not a successful motion test. Hold still longer, make two distinct small movements, and retry. If it still fails, note the app/firmware version and exact on-screen message.

Official instructions: [Local Testing](https://hub.evenrealities.com/docs/test/local-testing), [developer account and hardware setup](https://hub.evenrealities.com/docs/get-started/quickstart/hardware).

## Controls

| Where | Action | Result |
| --- | --- | --- |
| Drawing | Single tap | Pause / resume; cursor still moves while paused |
| Drawing | Swipe up | Recenter and pause |
| Drawing | Swipe down | Open menu and pause |
| Menu | Swipe up/down, then tap | Choose Back, Save, New canvas, Saved drawings, sensitivity, calibration, or Exit |
| Gallery | Swipe up/down | View another saved drawing |
| Gallery | Single tap | Return to the current canvas without altering it |
| Any screen | Double tap | Request the system exit confirmation |
| Phone view | Slider | Adjust sensitivity (0.25–3×); pauses drawing |

New canvas saves existing marks first. Explicit Save creates a snapshot; a separate draft is autosaved approximately every 1.5 seconds and on key actions. There are up to 50 saved drawings; delete them from the phone view. The cursor is never baked into saved images. A tracking gap pauses drawing and avoids a connecting streak; resume explicitly once samples return.

The artwork is a 200×100 image with 16 brightness levels. This keeps transfers small. It is not a 60 fps canvas: image updates travel through the phone and BLE, and can lag behind motion. Saving preserves the artwork, not a live view of the physical world.

## Install for personal use later (still no public store release)

Once the QR version behaves correctly, build a package:

```sh
nix develop
npm run pack
```

Output: `artifacts/headstroke-0.1.0.ehpk`.

A persistent install uses **Even's developer portal**; it is separate from publishing publicly:

- **Private build:** create your app/project in the portal, upload the package under Builds, and keep its tag **Private**. In the phone app, use **Even Hub → Me → Apps → Private builds → Install**. Launch from the phone; the computer/server is no longer needed. Private builds have limited background behavior.
- **Personal beta:** if you want a glasses-menu entry and locked-phone operation, add your own account under the project's **Testing group**, accept the invitation email so its status is **Active**, and change the build's **Private** tag to **Beta → Promote to Beta**. Install from **Me → Beta tester** in the phone app. Both Beta status and Active membership are required. This is not a public store submission. You can keep testing privately and never choose Public.

These two options upload your package to Even, but do **not** publish it to the store. If you want no package upload at all, stay with the QR workflow and its awake-phone/computer requirements. There is no documented standalone `.ehpk` file-open install path.

The local package ID is `io.khonager.headstroke`. Portal registration/availability has not been checked with a logged-in developer account. If the portal assigns or requires a different ID, update `app.json` and repack. HeadStroke fits the documented naming rules (10 characters; no reserved “Even” wording); no store reservation or trademark clearance is implied.

Official instructions: [Private Testing](https://hub.evenrealities.com/docs/test/private-testing), [Beta Testing](https://hub.evenrealities.com/docs/test/beta-testing), [packaging](https://hub.evenrealities.com/docs/ship/packaging).

## Checks and simulator

```sh
nix develop
npm run check       # unit/integration tests, TypeScript, build, browser tests
npm run dev         # leave running in terminal 1
npm run simulate    # terminal 2, also inside nix develop
```

For the simulator's local automation API:

```sh
npm run simulate -- --automation-port 9898
```

The simulator cannot establish real head tracking, firmware axis semantics, BLE speed, or lock-screen behavior. Browser tests cover the phone UI; synthetic motion tests cover exposure, calibration, input, persistence, and interruption handling. Actual G2 testing remains necessary.

### Hardware acceptance checklist

- [ ] Calibration accepts two distinct directions and the cursor moves intuitively in both dimensions.
- [ ] Sensitivity feels usable; recenter does not draw a line.
- [ ] Retracing brightens marks; quick travel leaves a fainter line.
- [ ] One tap pauses/resumes; paused repositioning leaves no connecting streak.
- [ ] Save, new canvas, and gallery work on glasses without touching the phone.
- [ ] Restart restores drawings, draft, sensitivity and calibration; starts paused.
- [ ] Disconnect/reconnect does not add a streak; drawing resumes only after a tap.
- [ ] Double tap shows the system exit dialog; exit then launch another glasses app.
- [ ] For personal beta: operate with the phone locked, leave it locked for five minutes, and verify saved artwork and interaction on return.

## Data and privacy

Only live sensor samples, calibration, sensitivity, draft and artwork are processed. There are no network requests, analytics, external services or additional phone permissions in the shipped app. Saved data uses the host SDK's local storage; browser preview has a separate local store. Clearing app data/uninstalling can erase it. There is no cloud backup. See [privacy policy](public/privacy.html).
