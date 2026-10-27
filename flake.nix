{
  description = "HeadStroke: local Even G2 development and testing";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forEachSystem (system:
        let
          pkgs = import nixpkgs { inherit system; };
          simulatorLibraries = with pkgs; [
            gtk3 gdk-pixbuf cairo glib webkitgtk_4_1 libsoup_3 alsa-lib
            stdenv.cc.cc.lib glibc
          ];
          simulator = pkgs.writeShellApplication {
            name = "headstroke-simulator";
            text = ''
              # Scope native libraries to the simulator, not every shell process.
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath simulatorLibraries}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
              binary="node_modules/@evenrealities/sim-linux-${if system == "x86_64-linux" then "x64" else "arm64"}/bin/evenhub-simulator"
              if [[ ! -x "$binary" ]]; then
                echo "Simulator missing. Run npm ci from the HeadStroke directory." >&2
                exit 1
              fi
              # Use this flake's loader too, avoiding reliance on system nix-ld.
              exec ${pkgs.stdenv.cc.bintools.dynamicLinker} "$binary" "$@"
            '';
          };
        in {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_22 pkgs.git pkgs.chromium simulator ];
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_CHROMIUM_EXECUTABLE = "${pkgs.chromium}/bin/chromium";
            HEADSTROKE_SIMULATOR = "${simulator}/bin/headstroke-simulator";
            shellHook = ''
              echo "HeadStroke dev shell: npm ci, then npm run dev"
              echo "Glasses: npm run qr -- --ip <your-computer-LAN-IP>"
              echo "Checks: npm run check | Simulator: npm run simulate"
            '';
          };
        });
    };
}
