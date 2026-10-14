Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "Evaluacion_Financiera_ObraTrack.xlsx").Path)
$entry = $zip.Entries | Where-Object { $_.FullName -eq "xl/worksheets/sheet10.xml" }
if ($entry) {
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $zip.Dispose()
    Write-Output "Sheet10 XML length: $($xml.Length)"
    
    # Check cells F9, C11, B21, B22, B23
    $matches = [System.Text.RegularExpressions.Regex]::Matches($xml, '<c r="(B21|B22|B23|C11|F9|F18)"[^>]*>.*?</c>')
    foreach ($m in $matches) {
        Write-Output $m.Value
    }
}
