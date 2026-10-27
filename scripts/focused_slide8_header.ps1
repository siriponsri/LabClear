$ErrorActionPreference='Stop'
$taskRoot='C:\Users\User\Desktop\myProject\LabClear\'
$ev=Join-Path $taskRoot 'docs\evidence\current\focused-remnants-20261012'
$file=Join-Path $taskRoot 'docs\presentation\LabClear_Presentation_TH.pptx'
$app=New-Object -ComObject PowerPoint.Application
if($app.Presentations.Count -ne 0){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app);throw 'Isolated PowerPoint unavailable; user presentations untouched.'}
$app.AutomationSecurity=3
try{
 $deck=$app.Presentations.Open($file,0,0,0)
 $slide=$deck.Slides.Item(8)
 $tableShape=@($slide.Shapes | Where-Object { $_.HasTable -eq -1 })[0]
 $table=$tableShape.Table
 $label=$table.Cell(1,2).Shape.TextFrame.TextRange.Text
 if($label -ne 'หลักฐานที่มี'){throw 'Unexpected evidence-column label'}
 $table.Cell(1,2).Shape.TextFrame.TextRange.Text=''
 $left=$tableShape.Left+$table.Columns.Item(1).Width+12
 $top=$tableShape.Top+4
 $width=$table.Columns.Item(2).Width-24
 $height=$table.Rows.Item(1).Height-8
 $header=$slide.Shapes.AddTextbox(1,$left,$top,$width,$height)
 $header.Name='EvidenceColumnHeaderFocusedRepair'
 $header.TextFrame.WordWrap=-1
 $header.TextFrame.MarginLeft=0;$header.TextFrame.MarginRight=0;$header.TextFrame.MarginTop=0;$header.TextFrame.MarginBottom=0
 $text=$header.TextFrame.TextRange;$text.Text='หลักฐานที่มี';$text.Font.Name='TH SarabunPSK';$text.Font.NameComplexScript='TH SarabunPSK';$text.Font.NameFarEast='TH SarabunPSK';$text.Font.Size=24;$text.Font.Bold=-1;$text.Font.Color.RGB=3480100
 $text.ParagraphFormat.SpaceAfter=0
 $deck.Save()
 $deck.SaveAs((Join-Path $taskRoot 'docs\presentation\LabClear_Presentation_TH.pdf'),32)
 $slide.Export((Join-Path $ev 'slide-08-native.png'),'PNG',1600,900)
 $slide.Export((Join-Path $taskRoot 'docs\evidence\current\presentation-20261012\rendered\slide-08.png'),'PNG',1600,900)
 [pscustomobject]@{Slide=8;Label='หลักฐานที่มี';LabelLeft=$left;Column2Left=($tableShape.Left+$table.Columns.Item(1).Width);Column2Right=($tableShape.Left+$table.Columns.Item(1).Width+$table.Columns.Item(2).Width);HeaderWidth=$width;Cell2TextCleared=$true;NativeRender='slide-08-native.png';NewProviderCalls=0} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ev 'slide8-header-position.json') -Encoding utf8
 $deck.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck)
}finally{$app.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}
