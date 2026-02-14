{
  description = "Plane hardware fork development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        inherit (pkgs) lib;

        # System libraries needed by Python C extensions at both compile time
        # (headers) and runtime (shared objects). Referenced in both buildInputs
        # and NIX_LD_LIBRARY_PATH to avoid duplication.
        pythonLibs = with pkgs; [
          openssl     # cryptography
          libffi      # cryptography, ctypes
          libpq       # psycopg3 / psycopg-c
          libxml2     # lxml
          libxslt     # lxml
          zlib        # compression (transitive dep of many packages)
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          name = "plane-hw-dev";

          buildInputs = with pkgs; [
            # Node.js and JavaScript tooling
            nodejs_22
            pnpm

            # Python and Python tooling
            python312
            uv
            ruff

            # PostgreSQL client and dev headers (libpq headers and pkg-config metadata for psycopg-c)
            postgresql
            postgresql.dev

            # Build tools for compiling C extensions
            pkg-config
            gcc

            # Docker (for infrastructure services: PostgreSQL, Redis, RabbitMQ, MinIO)
            docker
            docker-compose
          ] ++ pythonLibs;

          # Dynamic linker configuration for Nix environments.
          # uv installs pre-compiled manylinux wheels that expect to dlopen()
          # system libraries (libssl, libpq, etc.). NIX_LD tells the dynamic
          # linker where these Nix-provided libraries live.
          NIX_LD_LIBRARY_PATH = lib.makeLibraryPath ([ pkgs.stdenv.cc.cc ] ++ pythonLibs);
          NIX_LD = lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

          # Playwright: use Nix-provided browsers instead of downloading them
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = true;

          # uv: use Nix-provided Python, not a downloaded one
          UV_PYTHON_DOWNLOADS = "never";

          shellHook = ''
            # Put Nix library paths first so they take priority
            export LD_LIBRARY_PATH="$NIX_LD_LIBRARY_PATH''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

            # Create and activate Python venv via uv
            if [ ! -d .venv ]; then
              echo "Creating Python virtual environment..."
              uv venv .venv
            fi
            source .venv/bin/activate

            echo "Plane HW dev shell ready."
            echo "  Node.js: $(node --version)"
            echo "  pnpm:    $(pnpm --version)"
            echo "  Python:  $(python --version)"
            echo "  uv:      $(uv --version)"
          '';
        };
      }
    );
}
