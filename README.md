# HeadStroke

A local sketchbook for Even G2. Move your head to move the cursor. Exposure accumulates: repeated passes and slow movement brighten a mark; fast travel leaves a fainter line. Tap once to pause or resume. Drawings and sensitivity stay on your phone inside the normal Even Realities app. No separate phone app, backend, API keys, or public store listing are required.

**Status:** hardware-test build, not a verified hardware release. The official SDK supplies IMU samples, but does not document their physical axes or units. HeadStroke learns two directions from a three-position calibration. Calibrate with a rightward **tilt** and an upward **pitch**; turning your face sideways may not change the sensor data. It does not claim absolute yaw tracking or a cursor fixed to the room.

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
3. Put the computer and phone on the same reachable Wi-Fi network. Keep `npm run dev` running from the first terminal. On NixOS, open the dev-server port in the active firewall:

   ```sh
   sudo nixos-firewall-tool open tcp 5173
   ```

   This is a temporary firewall rule; it does not change your NixOS configuration or install a package. The project flake cannot open a system firewall port. After testing, `sudo nixos-firewall-tool reset` restores your configured rules (including removal of other temporary rules made with that tool).

4. **Before scanning**, open `http://YOUR_COMPUTER_LAN_IP:5173/` in your phone's ordinary browser. For the laptop used during development, the Wi-Fi address was `192.168.178.45`, so try `http://192.168.178.45:5173/` if that is still the address shown in Vite's `Network:` line. If the page does not load on the phone, the QR flow will not load either. Check that the dev server is still running, the Wi-Fi address is current, the firewall rule is open, and the router does not isolate Wi-Fi clients.
5. In a second terminal in this directory, run:

   ```sh
   nix develop
   npm run qr -- --ip YOUR_COMPUTER_LAN_IP
   ```

   Replace `YOUR_COMPUTER_LAN_IP` with your computer's Wi-Fi IPv4 address (for example `192.168.1.50`). The Vite terminal shows `Network:` addresses; choose your Wi-Fi address, not a VPN/container interface. You can also supply the entire address:

   ```sh
   npx evenhub qr --url http://192.168.1.50:5173
   ```

6. On your phone, open **Even Hub → developer section at the top right → Scan QR** (also called Prototype Mode/Dev Preview in some versions). Scan the terminal QR **inside the Even app**, not with the general camera app.
7. HeadStroke should appear on the glasses and in the phone's embedded app view. It starts paused with guided calibration. For each position, hold still for a moment and single-tap the glasses or press **Capture position** on the phone:

   - **1/3 — center:** face straight ahead in your normal drawing posture.
   - **2/3 — right:** keep your face pointed forward and tilt your **right ear toward your right shoulder**. Do not turn your face to look right.
   - **3/3 — up:** return fully to the first position, then **lift your chin** to look upward without tilting sideways.

   A weak or similar movement is rejected so the cursor does not learn a misleading direction. The phone shows live sensor readings and movement during calibration. If a step fails, hold the correct pose and tap again. The **Redo head calibration** button on the phone restarts it.
8. Return to the center pose. While still paused, move your head to check that a right tilt moves the cursor right and looking up moves it up. Swipe up to recenter; then tap to draw. Start at sensitivity **1.0×**, adjusting to comfort. Try a short stroke, pause, reposition, resume, retrace it, then save and reopen it. Drawing mode shows only the canvas and cursor on the glasses.

**Keep the phone awake and the Even app foregrounded during QR testing.** Local Testing is a live connection to your computer, not a permanent install. Locking the phone or switching apps can suspend it. Close HeadStroke and re-scan the QR after that, or after a code change. Your computer must keep running the dev server. Browser preview is only a mouse/touch test; opening the URL in Safari/Chrome does not connect it to the glasses.

If the QR does not load:

- Open `http://YOUR_COMPUTER_LAN_IP:5173/` in the phone's browser to check reachability. If it cannot open, revisit step 3's firewall rule and check the Wi-Fi address and client isolation.
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
