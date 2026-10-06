$env:PATH='C:\Windows\System32;D:\Git\bin;'+$env:PATH
$env:CARGO_TARGET_DIR='D:\SpanvisionToolchain\readiness\frame-target'
$env:TEMP='D:\SpanvisionToolchain\readiness\browser-temp'
$env:TMP=$env:TEMP
while (Get-Process -Id 22752 -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 5 }
Set-Location -LiteralPath 'C:\Users\dell\Documents\ChatGPT\own CAD\frame-vision-studio'
cargo test --locked -p ofs-core --jobs 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo run --locked -p ofs-core --example export_documents --jobs 1 -- 'C:\Users\dell\Documents\ChatGPT\own CAD\qa\readiness\frame-documents'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo check --manifest-path src-tauri/Cargo.toml --locked --jobs 1
exit $LASTEXITCODE
