#!/bin/zsh
# Build the "Magic Mirror Music" virtual output: BlackHole v0.7.1 (GPL-3.0, pinned commit)
# 48 kHz stereo: a playback-only "Magic Mirror Music" and a capture-only
# "Magic Mirror Capture" sharing the ring buffer. Only playback reports the
# runtime-settable video compensation; Airfoil's capture clock stays at zero.
# Run as the operator (no sudo): zsh build.sh   -> staged driver in ops/music-device/
set -euo pipefail
[[ $EUID -ne 0 ]] || { print -u2 "run as the operator user, not root"; exit 1; }
SRC="${0:A:h}"
COMMIT=e2b22aaaba4e507a097131704bf96dabc004d9cf   # BlackHole v0.7.1
FACTORY=c0206243-9ee1-4ea7-85b6-e0e850fb6866        # own plug-in factory UUID (no clash with stock BlackHole)
STAGE="$HOME/Library/Application Support/MagicMirror/ops/music-device"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
git -C "$WORK" init -q blackhole
git -C "$WORK/blackhole" fetch -q --depth 1 https://github.com/ExistentialAudio/BlackHole.git "$COMMIT"
git -C "$WORK/blackhole" checkout -q FETCH_HEAD
python3 -I "$SRC/latency-patch.py" "$WORK/blackhole/BlackHole/BlackHole.c"
sed -i '' "s/e395c745-4eea-4d94-bb92-46224221047c/$FACTORY/" "$WORK/blackhole/BlackHole/BlackHole.plist"
xcodebuild -quiet -project "$WORK/blackhole/BlackHole.xcodeproj" -configuration Release -target BlackHole \
  CONFIGURATION_BUILD_DIR="$WORK/out" PRODUCT_NAME=MagicMirrorMusic PRODUCT_BUNDLE_IDENTIFIER=com.magicmirror.music-device \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= MACOSX_DEPLOYMENT_TARGET=14.0 ARCHS=arm64 \
  GCC_PREPROCESSOR_DEFINITIONS='$GCC_PREPROCESSOR_DEFINITIONS kDriver_Name=\"MagicMirrorMusic\" kPlugIn_BundleID=\"com.magicmirror.music-device\" kPlugIn_Icon=\"BlackHole.icns\" kHas_Driver_Name_Format=false kDevice_Name=\"Magic\ Mirror\ Music\" kDevice2_Name=\"Magic\ Mirror\ Capture\" kDevice_HasInput=false kDevice_HasOutput=true kDevice2_IsHidden=false kDevice2_HasInput=true kDevice2_HasOutput=false kManufacturer_Name=\"Magic\ Mirror\" kSampleRates=48000 kNumber_Of_Channels=2 kEnableVolumeControl=false kCanBeDefaultSystemDevice=false' \
  build
mkdir -p "$STAGE"; rm -rf "$STAGE/MagicMirrorMusic.driver"
cp -R "$WORK/out/MagicMirrorMusic.driver" "$STAGE/"
codesign --verify "$STAGE/MagicMirrorMusic.driver"
print "BUILT $STAGE/MagicMirrorMusic.driver (BlackHole $COMMIT). Install: sudo zsh ${SRC}/install.sh"
