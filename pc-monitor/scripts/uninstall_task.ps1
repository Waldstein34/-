<#
  PC操作ログ監視ツールのタスクスケジューラ登録を解除します。
  管理者権限のPowerShellで実行してください。
#>

Unregister-ScheduledTask -TaskName "PCMonitorAgent" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "PCMonitorUploader" -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "タスクを削除しました。常駐していたエージェントは次回ログオフ/再起動で完全に止まります。"
