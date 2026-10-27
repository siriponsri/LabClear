param([string[]]$DocumentPaths)
$wordInstance = New-Object -ComObject Word.Application
if ($wordInstance.Documents.Count -ne 0) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordInstance)
    throw 'Renderer did not receive an isolated Word instance; user documents left untouched.'
}
$wordInstance.Visible = $false
$wordInstance.DisplayAlerts = 0
$wordInstance.AutomationSecurity = 3
try {
    foreach ($inputDocument in $DocumentPaths) {
        $resolvedDocument = (Resolve-Path -LiteralPath $inputDocument).Path
        $allowedRoot = 'C:\Users\User\Desktop\myProject\LabClear\docs\report\'
        $presentationRoot = 'C:\Users\User\Desktop\myProject\LabClear\docs\presentation\'
        if (-not ($resolvedDocument.StartsWith($allowedRoot,[System.StringComparison]::OrdinalIgnoreCase) -or $resolvedDocument.StartsWith($presentationRoot,[System.StringComparison]::OrdinalIgnoreCase))) { throw 'Document outside authorized report/presentation directories' }
        $outputPdf = [System.IO.Path]::ChangeExtension($resolvedDocument,'.pdf')
        $openedDocument = $wordInstance.Documents.Open($resolvedDocument,$false,$true)
        try {
            $openedDocument.Repaginate()
            [void]$openedDocument.Fields.Update()
            $openedDocument.Repaginate()
            $openedDocument.ExportAsFixedFormat($outputPdf,17,$false,0,0,1,1,0,$true,$false,1,$true,$true,$false)
            [pscustomobject]@{Document=$resolvedDocument;PDF=$outputPdf;Pages=$openedDocument.ComputeStatistics(2)} | ConvertTo-Json -Compress
        } finally {
            $openedDocument.Close(0)
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($openedDocument)
        }
    }
} finally {
    $wordInstance.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordInstance)
}
