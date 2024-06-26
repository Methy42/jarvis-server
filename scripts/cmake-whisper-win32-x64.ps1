
$CURRENT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

$WHISPER_DIR = Join-Path $CURRENT_DIR "..\whisper.cpp"
$BUILD_DIR = Join-Path $WHISPER_DIR "build-win32-x64"

Remove-Item -Path "$BUILD_DIR" -Recurse -Force

cmake.exe -S "$WHISPER_DIR" -B "$BUILD_DIR"
cmake.exe --build "$BUILD_DIR" --config Release

Copy-Item -Path "$WHISPER_DIR\libgcc_s_seh-1.dll" -Destination "$BUILD_DIR\bin\Release\"
Copy-Item -Path "$WHISPER_DIR\libstdc++-6.dll" -Destination "$BUILD_DIR\bin\Release\"
Copy-Item -Path "$WHISPER_DIR\libwinpthread-1.dll" -Destination "$BUILD_DIR\bin\Release\"
