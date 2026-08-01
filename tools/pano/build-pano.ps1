<#
build-pano.ps1 — 把一疊 360 環景照（equirectangular，寬高比 2:1）打包成單一 HTML 檔。

用法：
  .\build-pano.ps1 -Source "C:\Users\Joan\Downloads\雙城街2樓" -Out "..\..\pano\shuangcheng-2f-xxxxxx.html"

場景名稱：在 -Source 資料夾放一個 scenes.json（UTF-8）即可指定順序與名稱：
  {
    "title": "雙城街 2 樓",
    "scenes": [
      { "file": "S__27869217_0.jpg", "name": "入口主房", "desc": "進門第一間" }
    ]
  }
沒有 scenes.json 就自動掃描所有 2:1 圖片，依檔名排序，名稱為「場景 1、場景 2…」。

產出的 HTML 完全自給自足：圖片以 base64 內嵌，不連任何外部網站，離線可看。
頁面已加 noindex，不會被搜尋引擎收錄。
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Source,
  [Parameter(Mandatory)] [string] $Out,
  [string] $Title,
  [string] $Address,
  [int]    $Width   = 2048,   # 環景貼圖寬度，需為 2 的冪（WebGL 水平接縫需要 REPEAT）
  [int]    $Quality = 82
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$headPath = Join-Path $here 'template-head.html'
$tailPath = Join-Path $here 'template-tail.html'
foreach ($p in @($headPath, $tailPath)) {
  if (-not (Test-Path $p)) { throw "找不到模板：$p" }
}

$Source = (Resolve-Path $Source).Path
$enc = New-Object System.Text.UTF8Encoding($false)

# ---- 場景清單 ----
$cfgPath = Join-Path $Source 'scenes.json'
if (Test-Path $cfgPath) {
  $cfg = [System.IO.File]::ReadAllText($cfgPath, $enc) | ConvertFrom-Json
  if (-not $Title)   { $Title = $cfg.title }
  if (-not $Address) { $Address = $cfg.address }
  $scenes = @($cfg.scenes | ForEach-Object {
    [PSCustomObject]@{
      file = $_.file
      name = $_.name
      desc = if ($_.desc) { $_.desc } else { '' }
    }
  })
} else {
  $i = 0
  $scenes = @(Get-ChildItem -LiteralPath $Source -Include *.jpg,*.jpeg,*.png -File |
    Sort-Object Name | ForEach-Object {
      $img = [System.Drawing.Image]::FromFile($_.FullName)
      $ratio = $img.Width / $img.Height
      $img.Dispose()
      if ([math]::Abs($ratio - 2.0) -lt 0.05) {
        $i++
        [PSCustomObject]@{ file = $_.Name; name = "場景 $i"; desc = '' }
      }
    })
}
if (-not $scenes -or $scenes.Count -eq 0) { throw "在 $Source 找不到 2:1 的環景照片" }
if (-not $Title) { $Title = Split-Path $Source -Leaf }

# ---- 圖片處理 ----
function Save-Jpeg($bmp, $path, $q) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
           Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int64]$q)
  $bmp.Save($path, $codec, $ep)
  $ep.Dispose()
}
function Resize-ToFile($srcPath, $dstPath, $w, $h, $q) {
  $img = [System.Drawing.Image]::FromFile($srcPath)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose()
  Save-Jpeg $bmp $dstPath $q
  $bmp.Dispose(); $img.Dispose()
}
function Esc([string]$s) { ($s -replace '\\', '\\\\') -replace '"', '\"' }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("pano_" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory $work | Out-Null

$outDir = Split-Path $Out -Parent
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory $outDir -Force | Out-Null }

$sw = New-Object System.IO.StreamWriter($Out, $false, $enc)
try {
  $addrBlock = if ($Address) {
    '<div class="addr">' + (([string]$Address) -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;') + '</div>'
  } else { '' }
  $head = [System.IO.File]::ReadAllText($headPath, $enc).
            Replace('{{TITLE}}', $Title).
            Replace('{{ADDR_BLOCK}}', $addrBlock)
  $sw.Write($head)

  for ($k = 0; $k -lt $scenes.Count; $k++) {
    $s = $scenes[$k]
    $srcFile = Join-Path $Source $s.file
    if (-not (Test-Path $srcFile)) { throw "找不到圖片：$srcFile" }

    $big   = Join-Path $work "big_$k.jpg"
    $small = Join-Path $work "thb_$k.jpg"
    Resize-ToFile $srcFile $big   $Width ($Width / 2) $Quality
    Resize-ToFile $srcFile $small 320 160 72

    $sw.Write('{name:"');  $sw.Write((Esc $s.name))
    $sw.Write('",desc:"'); $sw.Write((Esc $s.desc))
    $sw.Write('",thumb:"data:image/jpeg;base64,')
    $sw.Write([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($small)))
    $sw.Write('",img:"data:image/jpeg;base64,')
    $sw.Write([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($big)))
    $sw.Write('"}')
    if ($k -lt $scenes.Count - 1) { $sw.Write(",`n") } else { $sw.Write("`n") }

    Write-Host ("  [{0}/{1}] {2}" -f ($k + 1), $scenes.Count, $s.name)
  }

  $sw.Write([System.IO.File]::ReadAllText($tailPath, $enc))
} finally {
  $sw.Close()
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

$size = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Write-Host ""
Write-Host ("完成：{0}（{1} 個場景，{2} MB）" -f $Out, $scenes.Count, $size)
