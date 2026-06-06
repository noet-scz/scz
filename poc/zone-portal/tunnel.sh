#!/bin/sh
# СЦЗ — поднять SSH-туннель до прокси-резолвера зоны (обход DPI).
# Браузер ходит на 127.0.0.1:8090, SSH несёт всё шифрованным до VPS.
# Пароль — из ~/Sync/backup/IT/Projects/Testorm/docs/archive/09_auth.md (server #2 / staging).
# Держать окно открытым, пока пользуешься зоной.

VPS="${SCZ_VPS:-144.31.25.136}"
LPORT="${SCZ_LPORT:-8090}"

echo "SSH-туннель: 127.0.0.1:$LPORT  ->  $VPS:8090 (портал зоны)"
echo "Оставь это окно открытым. Ctrl+C — закрыть туннель."
exec ssh -N -o ExitOnForwardFailure=yes -L "$LPORT:127.0.0.1:8090" "root@$VPS"
