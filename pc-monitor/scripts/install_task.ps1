<#
  PC操作ログ監視ツールを Windows のタスクスケジューラに登録します。
  管理者権限のPowerShellで実行してください。

  登録されるタスクは通常通りタスクスケジューラ画面や
  タスクマネージャーの「スタートアップ」「詳細」タブに表示されます
  (隠蔽・偽装は行っていません)。
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PythonwExe = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
$PythonExe = (Get-Command python.exe -ErrorAction SilentlyContinue).Source

if (-not $PythonwExe -or -not $PythonExe) {
    Write-Error "Python が見つかりません。インストールし、PATHに追加してから再実行してください。"
}

# 1. 監視エージェント: ログオン時に起動し、常駐して記録し続ける
$AgentAction = New-ScheduledTaskAction -Execute $PythonwExe -Argument "`"$RepoRoot\agent\main.py`""
$AgentTrigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "PCMonitorAgent" -Action $AgentAction -Trigger $AgentTrigger -Settings $Settings -Force

# 2. アップローダー: 一定間隔でログをNAS等へコピー
$UploadAction = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$RepoRoot\uploader.py`""
$UploadTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "PCMonitorUploader" -Action $UploadAction -Trigger $UploadTrigger -Settings $Settings -Force

Write-Host "登録が完了しました。タスクスケジューラで 'PCMonitorAgent' と 'PCMonitorUploader' を確認できます。"
Write-Host "アップロード間隔を config.yaml の upload.interval_min で変更した場合は、このスクリプトを再実行して登録し直してください。"
