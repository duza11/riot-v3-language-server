{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        buildNpmPackage = pkgs.buildNpmPackage.override {
          nodejs = pkgs.nodejs_26;
        };
        runtimeNode = pkgs."nodejs-slim_26";
      in
      {
        packages = rec {
          riot-v3-language-server = buildNpmPackage (finalAttrs: {
            pname = "riot-v3-language-server";
            version = "0.0.1";
            src = ./packages/language-server;

            npmDepsHash = "sha256-ee5Lh8U+XQrUSmN1Xzx3G/2ErTsuESwYPgcENj3i1KY=";

            postPatch = ''
              substituteInPlace tsconfig.json \
                --replace-fail '"extends": "../../tsconfig.base.json",' ""
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out/lib/riot-v3-language-server" "$out/bin"
              cp -R dist "$out/lib/riot-v3-language-server/dist"
              mkdir -p "$out/lib/riot-v3-language-server/node_modules"
              cp -R node_modules/typescript "$out/lib/riot-v3-language-server/node_modules/typescript"
              cp package.json "$out/lib/riot-v3-language-server/package.json"

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
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm_11
          ];
        };
      }
    );
}
