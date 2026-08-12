use scripting additions

on run
	set repoPath to "/Users/kojimacair/Desktop/hoikuen-shift-github"
	set dockerPath to "/usr/local/bin/docker"
	set internalWebApp to "/Users/kojimacair/Library/Application Support/AeN Shift/Internal/AeN Shift Web.app"

	try
		do shell script "test -d " & quoted form of repoPath & " && test -x " & quoted form of dockerPath & " && test -d " & quoted form of internalWebApp
	on error
		display dialog "AeN Shiftの起動に必要なファイルが見つかりません。開発担当へ連絡してください。" buttons {"OK"} default button "OK" with icon stop
		return
	end try

	try
		do shell script dockerPath & " info >/dev/null 2>&1"
	on error
		try
			do shell script "/usr/bin/open -a Docker"
		on error
			display dialog "Dockerを起動できませんでした。Docker Desktopを起動してから、もう一度AeN Shiftを開いてください。" buttons {"OK"} default button "OK" with icon stop
			return
		end try
		repeat with attempt from 1 to 60
			delay 2
			try
				do shell script dockerPath & " info >/dev/null 2>&1"
				exit repeat
			on error
				if attempt is 60 then
					display dialog "Dockerの起動を確認できませんでした。Docker Desktopの状態を確認し、もう一度お試しください。" buttons {"OK"} default button "OK" with icon stop
					return
				end if
			end try
		end repeat
	end try

	try
		do shell script "cd " & quoted form of repoPath & " && " & dockerPath & " compose up -d >/dev/null"
	on error
		display dialog "AeN Shiftのサービスを起動できませんでした。操作を繰り返さず、開発担当へ連絡してください。" buttons {"OK"} default button "OK" with icon stop
		return
	end try

	repeat with attempt from 1 to 60
		delay 1
		try
			set healthCode to do shell script "/usr/bin/curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/health"
			set readyCode to do shell script "/usr/bin/curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/ready"
			if healthCode is "200" and readyCode is "200" then
				do shell script "/usr/bin/open " & quoted form of internalWebApp
				return
			end if
		end try
	end repeat

	display dialog "AeN Shiftの起動確認に時間がかかっています。操作を繰り返さず、開発担当へ連絡してください。" buttons {"OK"} default button "OK" with icon stop
end run
