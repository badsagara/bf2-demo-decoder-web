#!/bin/sh
# BF2 Round Replay: the site's status (status.mjs in the repository; installed by units.sh)
exec node /srv/bf2replay/repo/server/status.mjs "$@"
