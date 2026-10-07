param([string]$Report = "$PSScriptRoot\..\docs\report\LabClear_Report_TH_3_0_1.docx")
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path $Report).Path
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.AutomationSecurity = 3 # Disable macros for this automation instance.
    $doc = $word.Documents.Open($path, $false, $false)
    for ($pass = 0; $pass -lt 2; $pass++) {
        $null = $doc.Fields.Update()
        foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
        foreach ($tof in $doc.TablesOfFigures) { $tof.Update() }
        $doc.Repaginate()
        foreach ($story in $doc.StoryRanges) {
            $range = $story
            while ($null -ne $range) {
                $null = $range.Fields.Update()
                $range = $range.NextStoryRange
            }
        }
    }
    $doc.Save()
    $pdf = [IO.Path]::ChangeExtension($path, '.pdf')
    $doc.ExportAsFixedFormat($pdf, 17)
    Write-Host "Saved: $path"
    Write-Host "PDF: $pdf"
    Write-Host 'Review all pages, contents, Thai wrapping and captions before submission.'
} finally {
    if ($null -ne $doc) { $doc.Close(0) }
    if ($null -ne $word) { $word.Quit() }
}
