{ pkgs ? import <nixpkgs> {} }:
let
in
pkgs.mkShell {
  packages = [ pkgs.emscripten pkgs.clang_12 pkgs.jq pkgs.htmlq pkgs.curl pkgs.nodejs pkgs.yarn pkgs.esbuild ];
  nativeBuildInputs = [ pkgs.pkg-config ];
  shellHooks = ''
    if ! [ -f papaparse.js ]; then
      curl -Lo papaparse-v5.4.0.zip "https://github.com/mholt/PapaParse/archive/refs/tags/5.4.0.zip"
      unzip papaparse-v5.4.0.zip
      pushd PapaParse-5.4.0
      echo "export default globalThis.Papa;" >> papaparse.js
      sed -i "s/function(root,/function(root=window,/" papaparse.js
      esbuild --minify papaparse.js > ../papaparse.js
      popd
    fi
    if ! [ -f writer.js ]; then
      echo "Missing wasm metadata writer; copy paste it from a build"
      exit 1
    fi
  '';
}
