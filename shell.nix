{ pkgs ? import <nixpkgs> {} }:
let
in
pkgs.mkShell {
  packages = [ pkgs.emscripten pkgs.clang_12 pkgs.jq pkgs.htmlq pkgs.curl pkgs.nodejs pkgs.yarn ];
  nativeBuildInputs = [ pkgs.pkg-config ];
  shellHooks = ''
    if ! [ -f fflate.js ]; then
      curl -o fflate-v0.7.4.tar.gz https://github.com/101arrowz/fflate/archive/refs/tags/v0.7.4.zip
      tar -xzvf fflate-v0.7.4.tar.gz
      pushd fflate-0.7.4
      yarn
      yarn run build:lib
      cp esm/browser.js ../fflate.js
      popd
    fi
    if ! [ -f writer.js ]; then
      echo "Missing wasm metadata writer; copy paste it from a build"
      exit 1
    fi
  '';
}
