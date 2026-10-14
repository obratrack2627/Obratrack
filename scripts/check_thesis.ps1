Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "Tesis ObraTrack.docx").Path)
$entry = $zip.Entries | Where-Object { $_.FullName -eq "word/document.xml" }
if ($entry) {
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $zip.Dispose()
    
    # Strip XML tags
    $text = [System.Text.RegularExpressions.Regex]::Replace($xml, "<[^>]+>", "`n")
    $lines = $text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    
    # Look for index / capitulos / financiero / evaluacion
    $lastHeadings = $lines | Where-Object { $_ -match "^(CAPÍTULO|Capítulo|\d{1,2}\.)" }
    Write-Output "=== LAST 30 HEADINGS IN THESIS ==="
    $lastHeadings | Select-Object -Last 30
}
