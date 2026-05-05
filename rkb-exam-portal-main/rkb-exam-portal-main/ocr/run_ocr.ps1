# Run this script to start the local OCR service for the Exam Portal
Write-Host "Checking for existing processes on port 8000..." -ForegroundColor Cyan
$proc = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($proc) {
    Write-Host "Killing existing process ($proc) on port 8000..." -ForegroundColor Yellow
    Stop-Process -Id $proc -Force
}

Write-Host "Starting OCR Service..." -ForegroundColor Green
Write-Host "Test URL: http://localhost:8000" -ForegroundColor Gray
python paddle_service_example.py
