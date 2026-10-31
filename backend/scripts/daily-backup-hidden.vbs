' Starts daily-backup.cmd with no window. A console window popping up at
' lunchtime got closed, and the copy with it, most days from 10/10/2026 on.
' The task "EduLink daily backup" runs this file with wscript.exe.
Set shell = CreateObject("WScript.Shell")
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit shell.Run("cmd /c """"" & folder & "\daily-backup.cmd""""", 0, True)
