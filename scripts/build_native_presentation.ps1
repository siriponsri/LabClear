param([string]$Payload='docs/evidence/current/presentation-20261012/deck-payload.json')
$taskRoot='C:\Users\User\Desktop\myProject\LabClear\'
$spec=Get-Content -LiteralPath (Join-Path $taskRoot $Payload) -Raw | ConvertFrom-Json
$build=Join-Path $taskRoot 'docs\evidence\current\presentation-20261012'
$output=Join-Path $taskRoot 'docs\presentation'
$pptApp=New-Object -ComObject PowerPoint.Application
if($pptApp.Presentations.Count -ne 0){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($pptApp);throw 'Isolated PowerPoint unavailable; user presentations untouched.'}
$pptApp.AutomationSecurity=3
function Color([string]$hex){return [Convert]::ToInt32($hex.Substring(0,2),16)+256*[Convert]::ToInt32($hex.Substring(2,2),16)+65536*[Convert]::ToInt32($hex.Substring(4,2),16)}
$ink=Color '241A35';$purple=Color '6539A9';$pale=Color 'EEE8F7';$gray=Color '665C73'
function Text($slide,[string]$text,[single]$x,[single]$y,[single]$w,[single]$h,[single]$size=24,[bool]$bold=$false,[int]$colour=$ink){
 $s=$slide.Shapes.AddTextbox(1,$x,$y,$w,$h);$s.TextFrame.WordWrap=-1;$s.TextFrame.MarginLeft=0;$s.TextFrame.MarginRight=0;$s.TextFrame.MarginTop=0;$s.TextFrame.MarginBottom=0
 $s.TextFrame.TextRange.Text=$text;$s.TextFrame.TextRange.Font.Name=$spec.font;$s.TextFrame.TextRange.Font.NameComplexScript=$spec.font;$s.TextFrame.TextRange.Font.NameFarEast=$spec.font;$s.TextFrame.TextRange.Font.Size=$size;$s.TextFrame.TextRange.Font.Bold= if($bold){-1}else{0};$s.TextFrame.TextRange.Font.Color.RGB=$colour
 $s.TextFrame.TextRange.ParagraphFormat.SpaceAfter=8
 return $s
}
function Line($slide,[single]$x1,[single]$y1,[single]$x2,[single]$y2,[bool]$arrow=$false){$s=$slide.Shapes.AddLine($x1,$y1,$x2,$y2);$s.Line.ForeColor.RGB=$purple;$s.Line.Weight=1.5;if($arrow){$s.Line.EndArrowheadStyle=3};return $s}
function Node($slide,$label,$detail,[single]$x,[single]$y,[single]$w,[single]$h){$box=$slide.Shapes.AddShape(1,$x,$y,$w,$h);$box.Fill.ForeColor.RGB=$pale;$box.Line.ForeColor.RGB=$purple;[void](Text $slide $label ($x+10) ($y+8) ($w-20) 32 24 $true);[void](Text $slide $detail ($x+10) ($y+38) ($w-20) ($h-42) 20);return $box}
function Picture($slide,[string]$file,[single]$x,[single]$y,[single]$w,[single]$maxH){
 $checked=[IO.Path]::GetFullPath($file);if(-not $checked.StartsWith($taskRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Asset outside LabClear'}
 $shape=$slide.Shapes.AddPicture($checked,0,-1,$x,$y,-1,-1);$shape.LockAspectRatio=-1;$shape.Width=$w;if($shape.Height -gt $maxH){$shape.Height=$maxH};return $shape
}
function Table($slide,$headers,$rows,[single]$x,[single]$y,[single]$w,[single]$h,[single]$font=22){
 $shape=$slide.Shapes.AddTable($rows.Count+1,$headers.Count,$x,$y,$w,$h);$table=$shape.Table
 if($headers.Count -eq 3){$table.Columns.Item(1).Width=$w*0.36;$table.Columns.Item(2).Width=$w*0.24;$table.Columns.Item(3).Width=$w*0.40}
 if($headers.Count -eq 2){$table.Columns.Item(1).Width=$w*0.42;$table.Columns.Item(2).Width=$w*0.58}
 for($c=1;$c -le $headers.Count;$c++){$cell=$table.Cell(1,$c);$cell.Shape.TextFrame.TextRange.Text=[string]$headers[$c-1];$cell.Shape.Fill.ForeColor.RGB=$pale}
 for($r=1;$r -le $rows.Count;$r++){for($c=1;$c -le $headers.Count;$c++){$cell=$table.Cell($r+1,$c);$cell.Shape.TextFrame.TextRange.Text=[string]$rows[$r-1][$c-1];$cell.Shape.Fill.ForeColor.RGB=Color 'FFFFFF'}}
 for($r=1;$r -le $rows.Count+1;$r++){for($c=1;$c -le $headers.Count;$c++){$tf=$table.Cell($r,$c).Shape.TextFrame;$tf.MarginLeft=12;$tf.MarginRight=12;$tf.MarginTop=4;$tf.MarginBottom=4;$tf.TextRange.Font.Name=$spec.font;$tf.TextRange.Font.Size=$font;$tf.TextRange.Font.Color.RGB=$ink;$tf.TextRange.Font.Bold=if($r -eq 1){-1}else{0}}}
 for($r=1;$r -le $rows.Count+1;$r++){$table.Rows.Item($r).Height=$h/($rows.Count+1);for($c=1;$c -le $headers.Count;$c++){$tf=$table.Cell($r,$c).Shape.TextFrame;$tf.TextRange.Font.NameComplexScript=$spec.font;$tf.TextRange.Font.NameFarEast=$spec.font}}
 for($r=1;$r -le $rows.Count+1;$r++){for($c=1;$c -le $headers.Count;$c++){$tf=$table.Cell($r,$c).Shape.TextFrame;$tf.VerticalAnchor=1;$tf.TextRange.ParagraphFormat.SpaceAfter=0;$tf.TextRange.ParagraphFormat.SpaceBefore=0;$tf.TextRange.ParagraphFormat.LineRuleWithin=-1;$tf.TextRange.ParagraphFormat.SpaceWithin=1}}
 return $shape
}
try {
 $deck=$pptApp.Presentations.Add(0);$deck.PageSetup.SlideWidth=960;$deck.PageSetup.SlideHeight=540
 $index=0
 foreach($item in $spec.slides){
  $index++;$slide=$deck.Slides.Add($index,12);$slide.FollowMasterBackground=0;$slide.Background.Fill.ForeColor.RGB=Color 'FFFFFF'
  if($item.layout -eq 'cover'){
   [void](Text $slide $item.title 60 105 840 80 60 $true $purple);[void](Text $slide $item.subtitle 60 198 840 55 30)
   [void](Text $slide ($item.body -join "`n") 60 318 840 145 24)
  }else{
   [void](Text $slide $item.title 48 32 864 78 34 $true $purple)
   switch($item.layout){
    'text' {$bodyShape=Text $slide ($item.body -join "`n") 60 146 840 282 27;$bodyShape.TextFrame.TextRange.ParagraphFormat.SpaceAfter=18}
    'image' {[void](Picture $slide $item.image 365 150 550 310);[void](Text $slide ($item.body -join "`n`n") 55 145 280 260 27);[void](Text $slide $item.caption 365 460 550 35 18 $false $gray)}
    'table' {$n=$item.rows.Count;$font=if($n -gt 12){19}elseif($n -gt 8){21}else{24};$height=if($n -gt 12){365}elseif($n -gt 8){340}else{290};[void](Table $slide $item.headers $item.rows 55 124 850 $height $font)}
    'matrix' {[void](Table $slide $item.headers $item.rows 55 145 850 220 28);[void](Text $slide 'คำขออันตรายหลุด 6 จาก 12 และคำถามปลอดภัยถูกหยุดผิด 1 จาก 12' 55 394 850 65 27)}
    'numbers' {[void](Text $slide $item.numbers[0][0] 55 145 400 90 58 $true $purple);[void](Text $slide $item.numbers[0][1] 55 231 400 40 25);[void](Text $slide $item.numbers[1][0] 515 145 380 90 58 $true $purple);[void](Text $slide $item.numbers[1][1] 515 231 380 40 25);[void](Text $slide ($item.body -join "`n") 55 315 850 120 25)}
    'unit' {[void](Text $slide ($item.body -join "`n") 55 140 495 200 29);[void](Picture $slide $item.unit_image 635 150 205 90);[void](Picture $slide $item.image 55 355 850 115)}
    'architecture' {
     [void](Node $slide $item.nodes[0][0] $item.nodes[0][1] 45 175 180 95);[void](Node $slide $item.nodes[1][0] $item.nodes[1][1] 280 175 180 95);[void](Node $slide $item.nodes[2][0] $item.nodes[2][1] 515 175 180 95)
     [void](Node $slide $item.nodes[3][0] $item.nodes[3][1] 745 120 180 100);[void](Node $slide $item.nodes[4][0] $item.nodes[4][1] 745 290 180 100);[void](Node $slide $item.nodes[5][0] $item.nodes[5][1] 515 425 410 72)
     [void](Line $slide 225 222 280 222 $true);[void](Line $slide 460 222 515 222 $true);[void](Line $slide 695 200 720 200);[void](Line $slide 720 200 720 165);[void](Line $slide 720 165 745 165 $true);[void](Line $slide 695 245 720 245);[void](Line $slide 720 245 720 340);[void](Line $slide 720 340 745 340 $true);[void](Line $slide 835 390 835 425 $true)
    }
    'flow' {
     for($i=0;$i -lt 5;$i++){[void](Node $slide $item.nodes[$i][0] $item.nodes[$i][1] (40+$i*184) 195 160 150);if($i -lt 4){[void](Line $slide (200+$i*184) 270 (224+$i*184) 270 $true)}}
    }
   }
   if($item.callout){[void](Text $slide $item.callout 55 488 850 35 20 $true $gray)}
  }
  # Notes retain the Thai narrative and exact source pointers.
  $notes=$item.notes+"`n`nSources:`n"+($item.sources -join "`n")
  try {$noteRange=$slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange;$noteRange.Text=$notes;$noteRange.Font.Name=$spec.font;$noteRange.Font.NameComplexScript=$spec.font;$noteRange.Font.NameFarEast=$spec.font}catch {throw 'Could not preserve required editable speaker notes'}
  $slide.SlideShowTransition.AdvanceOnClick=-1;$slide.SlideShowTransition.AdvanceOnTime=0
 }
 $draft=Join-Path $build 'LabClear_Presentation_TH.draft.pptx';$final=Join-Path $output 'LabClear_Presentation_TH.pptx';$pdf=Join-Path $output 'LabClear_Presentation_TH.pdf'
 $deck.SaveAs($draft,24);$deck.SaveCopyAs($final,24);$deck.SaveAs($pdf,32)
 $renders=Join-Path $build 'rendered';New-Item -ItemType Directory -Path $renders -Force | Out-Null
 foreach($slide in $deck.Slides){$slide.Export((Join-Path $renders ('slide-{0:d2}.png' -f $slide.SlideIndex)),'PNG',1600,900)}
 [pscustomobject]@{Slides=$deck.Slides.Count;EditablePPTX=$final;PDF=$pdf;Rendering='Native PowerPoint16.0';UpstreamInstallersExecuted=0} | ConvertTo-Json -Compress
 $deck.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck)
} finally {$pptApp.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($pptApp)}
