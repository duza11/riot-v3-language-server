{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachSystem [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ] (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_26;
        pnpm = pkgs.pnpm_11.override {
          nodejs-slim = pkgs."nodejs-slim_26";
        };
        runtimeNode = pkgs."nodejs-slim_26";
      in
      {
        packages = rec {
          riot-v3-language-server = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "riot-v3-language-server";
            version = "0.0.1";
            src = ./.;

            pnpmWorkspaces = [ "@duza11/riot-v3-language-server" ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs)
                pname
                version
                src
                pnpmWorkspaces
                ;
              inherit pnpm;
              fetcherVersion = 4;
              hash = "sha256-xi275lyNAgOcT5JiypKN2KO/YsKZamD9Jdjy/8bF0WY=";
            };

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.pnpmConfigHook
            ];

            buildPhase = ''
              runHook preBuild

              pnpm --filter @duza11/riot-v3-language-server build

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out/lib/riot-v3-language-server" "$out/bin"
              cp -R packages/language-server/dist "$out/lib/riot-v3-language-server/dist"
              mkdir -p "$out/lib/riot-v3-language-server/node_modules"
              cp -RL packages/language-server/node_modules/typescript "$out/lib/riot-v3-language-server/node_modules/typescript"
              cp packages/language-server/package.json "$out/lib/riot-v3-language-server/package.json"

              cat > "$out/bin/riot-v3-language-server" <<EOF
              #!${pkgs.runtimeShell}
              if [ "\''${1:-}" = "--version" ]; then
                echo "${finalAttrs.version}"
              else
                exec ${runtimeNode}/bin/node "$out/lib/riot-v3-language-server/dist/index.js" "\$@"
              fi
              EOF
              chmod +x "$out/bin/riot-v3-language-server"

              runHook postInstall
            '';

            meta = {
              description = "Language server for Riot.js v3 single-file components";
              mainProgram = "riot-v3-language-server";
              platforms = pkgs.lib.platforms.all;
            };
          });

          default = riot-v3-language-server;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_26
            pnpm_11
          ];
        };
      }
    );
}
