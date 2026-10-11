# BF2 Round Replay upload settings (Windows). Lines are PowerShell.
# Where the finished demos end up: the server's demos folder, or rotate_demo's target_root if sv.autoDemoHook moves them.
$DemoDir = 'C:\BF2Server\mods\bf2\demos'
# The private key this script logs in with (see README: made once with ssh-keygen, readable only by SYSTEM and admins)
$Key = 'C:\ProgramData\bf2replay\id_ed25519'
# Where to send them: user@host or user@host:port, as many as you like
$Targets = @(
  'bf2upload@replay.example.com'
#  ,'bf2upload@backup.example.org:2222'
)
# Optional: send only demos from this date on ('2026-10-01'; '' = everything in $DemoDir)
$Since = ''
# Optional: skip demos smaller than this (bytes). 0 = send all; the replay server drops rounds nobody played anyway.
$MinBytes = 0
